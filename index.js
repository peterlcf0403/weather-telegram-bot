'use strict'

var Bot = require('node-telegram-bot-api');
var feed = require('feed-read');

// topic list
var topics = ['current', 'warning'];

// set up bot
var token = '181337028:AAFfWt_1vivoBVwmC8K28ZRzmaegiedp1HM';
var bot = new Bot(token, { polling: true });

// command listeners
// 'topic' command
bot.onText(/^topic$/, function (msg, match){
  console.log('[topic] command received: ' + match[0]);
  bot.sendMessage(msg.chat.id, topics.join(', '));
});


console.log('bot server started...');