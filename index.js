'use strict'

var Bot = require('node-telegram-bot-api');
var feed = require('feed-read');

var token = '181337028:AAFfWt_1vivoBVwmC8K28ZRzmaegiedp1HM';
var bot;
var topics = [];

// topic class
function Topic(name, url, parser) {
  this.name = name;
  this.url = url;
  this.data = 'No update for ' + this.name;
  this.parser = parser.bind(this);
}

Topic.prototype = {
  update: function() {
    var topic = this;
    feed(this.url, function(err, rss) {
      console.log('['+ topic.name +'] rss fetched');
      topic.parser(rss);
      console.log(topic.data);
    });
  }
};

// server init
function init() {
  // create topic objects
  topics.push( new Topic(
    'current', 
    'http://rss.weather.gov.hk/rss/CurrentWeather.xml', 
    function(rss) {
      var text = rss[0].content.replace(/<[^>]*>/g, '').split('\r\n');
      text[3] = text[2].trim() + ' ' + text[3].trim();
      this.data = text.slice(3,8).join('\n');
    }
  ));
  
  topics.push( new Topic(
    'warning', 
    'http://rss.weather.gov.hk/rss/WeatherWarningSummaryv2.xml', 
    function(rss) {
      this.data = rss[0].content.replace(/<[^>]*>/g, '');
    }
  ));
  
  // set up bot
  var bot = new Bot(token, { polling: true });
  
  // adding listeners
  // 'topic' command listener
  bot.onText(/^topic$/, function (msg, match){
    console.log('[topic] command received: ' + match[0]);
    bot.sendMessage(msg.chat.id, topics.map(function(e){ return e.name }).join(', '));
  });
  
  console.log('bot server started...');
}

init();
