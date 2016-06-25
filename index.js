'use strict'

var Bot = require('node-telegram-bot-api');
var feed = require('feed-read');
var cheerio = require('cheerio');

var token = '181337028:AAFfWt_1vivoBVwmC8K28ZRzmaegiedp1HM';
var bot = new Bot(token, { polling: true });
var topics = [];

// topic class
function Topic(name, url, parser, update) {
  
  // name of the topic used when subscribe & query
  this.name = name;
  
  // url of the topic's rss feed
  this.url = url;
  
  // stores chat ids that have subscribed the topic
  this.subs = [];
  
  // function to parse the feed to suitable format
  this.parser = parser.bind(this);
  
  // function to determine when to update the feed
  this.update = update.bind(this);
  
  // stores the last feed
  this.data = 'No content available for ' + this.name;
  
  // the time of the feed source last update
  this.lastPublish = null;
  
  // the time of the last attempt to get the feed
  this.lastFeed = null;
}

Topic.prototype = {
  
  // get rss feed of the topic
  getFeed: function() {
    var topic = this;
    feed(this.url, function(err, rss) {
      console.log('Received feed of topic ['+ topic.name +']...');
      
      // check if the rss feed is updated
      var date = rss[0].published;
      if (topic.lastPublish != null && date.getTime() == topic.lastPublish.getTime()) {
        console.log('\tNo update.');
      } else {
        console.log('\tcontent updated!');
        
        // parse rss feed and update publish time
        topic.lastPublish = date;
        if (typeof topic.parser == 'function')
          topic.data = topic.parser(rss);
        else
          topic.data = rss[0].content;
        
        // send updates to chats
        topic.subs.forEach(function(id){
          bot.sendMessage(id, topic.data);
        });
      }
      // update last feed time
      topic.lastFeed = new Date();
    });
  },
  
  // add chat into topic's subscribe list
  subscribe: function(id) {
    if (this.subs.indexOf(id) == -1) {
      this.subs.push(id);
      console.log('New subscriber to topic ['+ this.name +']');
      return true;
    }
    else return false;
  },
  
  // remove chat from topic's subscribe list
  unsubscribe: function(id) {
    var index = this.subs.indexOf(id);
    if (index == -1)
      return false;
    else {
      this.subs.splice(index, 1);
      console.log('A subscriber is left from topic ['+ this.name +']');
      return true;
    }
  }
};


// server initialization
function init() {
  // create topic objects
  // topic 'current'
  topics.push( new Topic(
    'current', 
    'http://rss.weather.gov.hk/rss/CurrentWeather.xml', 
    function(rss) {
      // scrap wanted part from content
      let $ = cheerio.load(rss[0].content);
      var child = $('p')[0].children;
      
      // reformat first line (time & location)
      var tmp = child[0].data.split('\r\n');
      var result = tmp[1].trim() + ' ' + tmp[2].trim();
      
      // process other lines, skips non-text childs
      for (let i=1; i<child.length; i++) {
        if (child[i].type == 'text') {
          let str = child[i].data.trim();
          if (str != '')
            result += '\n   ' + str;
        }
      }
      console.log(result);
      return result;
    },
    function() {
      var currentTime = new Date();
      var min = currentTime.getMinutes();
      
      // default interval for try getting current weather feed (10min)
      var interval = 300000;
      
      // if its around 0 min, set a smaller interval
      if (min < 10 || min > 50) interval = 30000;
      if (currentTime.getTime() - this.lastFeed.getTime() > interval) {
        this.getFeed();
      }
    }
  ));
  
  // topic 'warning'
  topics.push( new Topic(
    'warning', 
    'http://rss.weather.gov.hk/rss/WeatherWarningSummaryv2.xml', 
    function(rss) {
      return rss[0].content.replace(/<[^>]*>/g, '').trim();
    },
    function() {
      var currentTime = new Date();
      var interval = 30000;
      if (currentTime.getTime() - this.lastFeed.getTime() > interval) {
        this.getFeed();
      }
    }
  ));
  
  // adding command listeners
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
  
  // update topics' feed
  topics.forEach(function(topic) {
    topic.getFeed();
  });
  
  console.log('bot server started...');
}

init();

// auto update topic's rss feed
setInterval(function() {
  topics.forEach(function(topic) {
    if (typeof topic.update == 'function')
      topic.update();
  });
}, 10000);

