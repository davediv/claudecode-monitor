/**
 * Telegram Bot API integration module
 * Handles sending notifications to Telegram groups
 */

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramMessage {
  version: string;
  date: string;
  changes: string[];
  changelogUrl: string;
}

/**
 * Sends a message to Telegram using the Bot API
 * @param config - Telegram bot configuration
 * @param message - Message content
 * @param retries - Number of retry attempts (default: 3)
 */
export async function sendTelegramNotification(
  config: TelegramConfig,
  message: TelegramMessage,
  retries: number = 3
): Promise<void> {
  const formattedMessage = formatMessage(message);
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: formattedMessage,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Telegram API error: ${response.status} - ${errorData}`);
      }
      
      // Success, exit retry loop
      return;
      
    } catch (error) {
      lastError = error as Error;
      console.error(`Telegram notification attempt ${attempt + 1} failed:`, error);
      
      // If not the last attempt, wait before retrying (exponential backoff)
      if (attempt < retries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed
  throw new Error(`Failed to send Telegram notification after ${retries} attempts: ${lastError?.message}`);
}

/**
 * Formats the message for Telegram with markdown
 * @param message - Message data
 * @returns Formatted message string
 */
function formatMessage(message: TelegramMessage): string {
  const changesList = message.changes
    .slice(0, 10) // Limit to first 10 changes
    .map(change => change)
    .join('\\n');
  
  // Format date to be more readable
  const date = new Date(message.date);
  const formattedDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  return `🚀 *New Claude Code Release!*

Version: *v${message.version}*
Released: ${formattedDate}

*What's New:*
${changesList}${message.changes.length > 10 ? '\\n... and more' : ''}

Full changelog: [View on GitHub](${message.changelogUrl})`;
}