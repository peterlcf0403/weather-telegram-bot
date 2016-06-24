'use strict'

var Bot = require('node-telegram-bot-api');
var feed = require('feed-read');

var token = '181337028:AAFfWt_1vivoBVwmC8K28ZRzmaegiedp1HM';
var bot = new Bot(token, { polling: true });
var topics = [];

// topic class
function Topic(name, url, parser) {
  this.name = name;
  this.url = url;
  this.data = 'No update for ' + this.name;
  this.parser = parser.bind(this);
  this.chatIDs = [];
  this.lastUpdate = null;
}

Topic.prototype = {
  
  // update rss feed of the topic
  update: function() {
    var topic = this;
    feed(this.url, function(err, rss) {
      var date = rss[0].published;
      console.log('Received feed of topic ['+ topic.name +']...');
      //console.log('\tDate: ' + date);
      if (topic.lastUpdate != null && date.getTime() == topic.lastUpdate.getTime()) {
        console.log('\tNo update.');
      } else {
        topic.lastUpdate = date;
        topic.parser(rss);
        console.log('\tcontent updated!');
        //console.log(rss);
        
        // send updates to chats
        topic.chatIDs.forEach(function(id){
          bot.sendMessage(id, topic.data);
        });
      }
    });
  },
  
  // add chat into topic's subscribe list
  subscribe: function(id) {
    if (this.chatIDs.indexOf(id) == -1) {
      this.chatIDs.push(id);
      console.log('New subscriber to topic ['+ this.name +']');
      return true;
    }
    else {
      return false;
    }
  },
  
  // remove chat from topic's subscribe list
  unsubscribe: function(id) {
    var index = this.chatIDs.indexOf(id);
    if (index == -1)
      return false;
    else {
      this.chatIDs.splice(index, 1);
      console.log('A subscriber is left from topic ['+ this.name +']');
      return true;
    }
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
  
  // adding listeners
  // 'topic' command listener
  bot.onText(/^topic$/, function (msg, match){
    console.log('[topic] command received: ' + match[0]);
    bot.sendMessage(msg.chat.id, topics.map(function(e){ return e.name }).join(', '));
  });
  
  // 'tellme' command listener
  bot.onText(/^tellme (.+)$/, function (msg, match) {
    console.log('[tellme] command received: ' + match[0]);
    var name = match[1];
    var topic = topics.find(function(e, i, array) { return e.name === name; });
    if (topic === undefined) {
      bot.sendMessage(msg.chat.id, 'Topic \'' + name + '\' not found!\nType \'topic\' to see available topics.');
    } else {
      bot.sendMessage(msg.chat.id, topic.data);
    }
  });
  
  // 'subscribe' command listener
  bot.onText(/^subscribe (.+)$/, function (msg, match) {
    console.log('[subscribe] command received: ' + match[0]);
    var name = match[1];
    var topic = topics.find(function(e, i, array) { return e.name === name; });
    if (topic === undefined) {
      bot.sendMessage(msg.chat.id, 'Topic \'' + name + '\' not found!\nType \'topic\' to see available topics.');
    } else {
      if (topic.subscribe(msg.chat.id)) {
        bot.sendMessage(msg.chat.id, 'Subscribe successfully!');
      } else {
        bot.sendMessage(msg.chat.id, 'You are already subscribed to the topic!');
      }
    }
  });
  
  // 'unsubscribe' command listener
  bot.onText(/^unsubscribe (.+)$/, function (msg, match) {
    console.log('[unsubscribe] command received: ' + match[0]);
    var name = match[1];
    var topic = topics.find(function(e, i, array) { return e.name === name; });
    if (topic === undefined) {
      bot.sendMessage(msg.chat.id, 'Topic \'' + name + '\' not found!\nType \'topic\' to see available topics.');
    } else {
      if (topic.unsubscribe(msg.chat.id)) {
        bot.sendMessage(msg.chat.id, 'Unsubscribe successfully!');
      } else {
        bot.sendMessage(msg.chat.id, 'You do not subscribe to this topic before!');
      }
    }
  });
  
  // update topics
  topics.forEach(function(topic) {
    topic.update();
  });
  
  console.log('bot server started...');
}

init();

// for debug
setInterval(function() {
  topics.forEach(function(topic) {
    topic.update();
  });
}, 10000);

