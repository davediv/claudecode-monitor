export default {
  async scheduled(event, env, ctx) {
    await checkForUpdates(env);
  },

  async fetch(request, env, ctx) {
    if (request.method === 'GET' && new URL(request.url).pathname === '/check') {
      await checkForUpdates(env);
      return new Response('Check completed', { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  },
};

async function checkForUpdates(env) {
  const RELEASE_NOTES_URL = 'https://docs.anthropic.com/en/release-notes/claude-code.md';
  const TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = env.TELEGRAM_CHAT_ID;
  
  try {
    // Fetch the release notes page
    const response = await fetch(RELEASE_NOTES_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch release notes: ${response.status}`);
    }
    
    const content = await response.text();
    
    // Extract the latest release date using regex
    // Looking for date patterns like "## December 20, 2024" or similar
    const dateRegex = /##\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/g;
    const matches = [...content.matchAll(dateRegex)];
    
    if (matches.length === 0) {
      console.log('No release dates found');
      return;
    }
    
    // Get the most recent date (first match)
    const latestDateStr = matches[0][1];
    const latestDate = new Date(latestDateStr);
    
    // Get the last checked date from KV storage
    const lastCheckedStr = await env.CLAUDE_CODE_KV.get('last_checked_date');
    const lastCheckedDate = lastCheckedStr ? new Date(lastCheckedStr) : new Date(0);
    
    // Check if this is a new release
    if (latestDate > lastCheckedDate) {
      // Extract the content for this release
      const releaseContent = extractReleaseContent(content, matches[0][0]);
      
      // Send Telegram notification
      await sendTelegramNotification(
        TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID,
        latestDateStr,
        releaseContent
      );
      
      // Update the last checked date
      await env.CLAUDE_CODE_KV.put('last_checked_date', latestDateStr);
      console.log(`New release found and notification sent: ${latestDateStr}`);
    } else {
      console.log('No new releases');
    }
  } catch (error) {
    console.error('Error checking for updates:', error);
    // Optionally send error notification
    if (env.SEND_ERROR_NOTIFICATIONS === 'true') {
      await sendTelegramNotification(
        TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID,
        'Error',
        `Failed to check Claude Code updates: ${error.message}`
      );
    }
  }
}

function extractReleaseContent(fullContent, releaseHeader) {
  // Find the position of the current release header
  const startIndex = fullContent.indexOf(releaseHeader);
  if (startIndex === -1) return 'Content not found';
  
  // Find the next release header (if any)
  const nextHeaderRegex = /##\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}/g;
  nextHeaderRegex.lastIndex = startIndex + releaseHeader.length;
  const nextMatch = nextHeaderRegex.exec(fullContent);
  
  // Extract content between headers
  const endIndex = nextMatch ? nextMatch.index : fullContent.length;
  let releaseContent = fullContent.substring(startIndex + releaseHeader.length, endIndex).trim();
  
  // Limit content length for Telegram
  if (releaseContent.length > 3000) {
    releaseContent = releaseContent.substring(0, 2997) + '...';
  }
  
  return releaseContent;
}

async function sendTelegramNotification(botToken, chatId, date, content) {
  const message = `🚀 *New Claude Code Update!*\n\n📅 *Release Date:* ${date}\n\n${content}\n\n[View full release notes](https://docs.anthropic.com/en/release-notes/claude-code)`;
  
  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const response = await fetch(telegramUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${error}`);
  }
  
  return response.json();
}