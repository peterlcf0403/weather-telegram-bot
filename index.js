'use strict'

var Bot = require('node-telegram-bot-api'),
    feed = require('feed-read'),
    cheerio = require('cheerio'),
    mongoose = require('mongoose'),
    Chat = require('./model/chat');

// telegram bot token
var token = '181337028:AAFfWt_1vivoBVwmC8K28ZRzmaegiedp1HM';
// telegram bot
var bot = new Bot(token, { polling: true });
// storing all topic objects
var topicList;


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
    try {
    feed(this.url, function(err, rss) {
      if (err) throw err;
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
    } catch (err) {
      console.log(err);
    }
  },
  
  // add chat into topic's subscribe list
  subscribe: function(id, callback) {
    var topic = this;
    // finding chat in db
    try {
      Chat.find({id: id}, function(err, res) {
        var chat;
        if (err) throw err;
        else if (res.length == 0) {
          // chat not exist. create new chat
          chat = new Chat({ 
            id: id, 
            language: 'eng',
            topics: []
          });
        }
        // chat exist. 
        else chat = res[0];

        // check if chat already subscribed the topic
        if (chat.topics.indexOf(topic.name) == -1) {
          // new subscriber. update chat's topic list
          chat.topics.push(topic.name);
          chat.save(function(err) {
            if (err) throw err;
            // update topic's subscriber list
            if (topic.subs.indexOf(id) == -1) {
              topic.subs.push(id);
            }
            callback(null, true);
            console.log('New subscriber to topic ['+ topic.name +']');
          });
        } else {
          // already subscribed
          callback(null, false);
        }
      });
    } catch (err) {
      console.log(err);
      callback(err, null);
    }
  },
  
  // remove chat from topic's subscribe list
  unsubscribe: function(id, callback) {
    var topic = this;
    // finding chat in db
    try {
      Chat.find({id: id}, function(err, res) {
        if (err) throw err;
        else if (res.length == 0) {
          // chat not exist. 
          callback(null, false);
        }
        else {
          // chat exist. check if chat already subscribed the topic
          var chat = res[0];
          var index = chat.topics.indexOf(topic.name);
          if (index == -1) {
            // not subscribe yet
            callback(null, false);
          } else {
            // is subscribed. remove the topic
            chat.topics.splice(index, 1);
            chat.save(function(err) {
              if (err) throw err;
              var index = topic.subs.indexOf(id);
              console.log(index);
              if (index != -1) {
                topic.subs.splice(index, 1);
              }
              callback(null, true);
              console.log('A subscriber is left from topic ['+ topic.name +']');
            });
          }
        }
      });
    } catch (err) {
      console.log(err);
      callback(err, null);
    }
  }
};

// server initialization
function init() {

  topicList = [];
  
  // create topic objects
  // topic 'current'
  topicList.push( new Topic(
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
      //console.log(result);
      return result;
    },
    function() {
      var currentTime = new Date();
      var min = currentTime.getMinutes();
      
      // default interval for try getting current weather feed (5min)
      var interval = 300000;
      
      // if its around 0 min, set a smaller interval (30s)
      if (min < 10 || min > 55) interval = 30000;
      if (currentTime.getTime() - this.lastFeed.getTime() > interval) {
        this.getFeed();
      }
    }
  ));
  
  // topic 'warning'
  topicList.push( new Topic(
    'warning', 
    'http://rss.weather.gov.hk/rss/WeatherWarningSummaryv2.xml', 
    function(rss) {
      // remove html tags
      return rss[0].content.replace(/<[^>]*>/g, '').trim();
    },
    function() {
      var currentTime = new Date();
      // update every 30s
      var interval = 30000;
      if (currentTime.getTime() - this.lastFeed.getTime() > interval) {
        this.getFeed();
      }
    }
  ));
  
  
  // database connection
  var dbURI = 'mongodb://root:root@ds023714.mlab.com:23714/weather-bot';
  var db = mongoose.connection;
  db.on( 'error', console.error);
  db.once( 'open', function() {
    console.log('Connected to databse');
    
    // read topics subscribers
    console.log('Reading subscriber of topics...')
    Chat.find({}, function(err, res) {
      res.forEach(function(chat){
        chat.topics.forEach(function(topic){
          for (let i=0; i<topicList.length; i++) {
            if (topicList[i].name === topic) {
              topicList[i].subs.push(chat.id);
              break;
            }
          }
        });
      });
    });
    console.log('Finished reading subscribers');
  
  
  // setting up command listeners
  // 'topic' command listener
  bot.onText(/^topic$/, function (msg, match){
    console.log('[topic] command received: ' + match[0]);
    bot.sendMessage(msg.chat.id, topicList.map(function(e){ return e.name }).join(', '));
  });
  
  // 'tellme' command listener
  bot.onText(/^tellme (.+)$/, function (msg, match) {
    console.log('[tellme] command received: ' + match[0]);
    var name = match[1];
    var topic = topicList.find(function(e, i, array) { return e.name === name; });
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
    var topic = topicList.find(function(e, i, array) { return e.name === name; });
    if (topic === undefined) {
      bot.sendMessage(msg.chat.id, 'Topic \'' + name + '\' not found!\nType \'topic\' to see available topics.');
    } else {
      topic.subscribe(msg.chat.id, function(err, res){
        if (err)
          bot.sendMessage(msg.chat.id, 'Error occured! Please try it later.');
        else if (res)
          bot.sendMessage(msg.chat.id, 'Subscribe successfully!');
        else
          bot.sendMessage(msg.chat.id, 'You are already subscribed to the topic!');
      });
    }
  });
  
  // 'unsubscribe' command listener
  bot.onText(/^unsubscribe (.+)$/, function (msg, match) {
    console.log('[unsubscribe] command received: ' + match[0]);
    var name = match[1];
    var topic = topicList.find(function(e, i, array) { return e.name === name; });
    if (topic === undefined) {
      bot.sendMessage(msg.chat.id, 'Topic \'' + name + '\' not found!\nType \'topic\' to see available topics.');
    } else {
      topic.unsubscribe(msg.chat.id, function(err, res) {
        if (err)
          bot.sendMessage(msg.chat.id, 'Error occured! Please try it later.');
        else if (res)
          bot.sendMessage(msg.chat.id, 'Unsubscribe successfully!');
        else
          bot.sendMessage(msg.chat.id, 'You did not subscribe to this topic before!');
      });
    }
  });
    
    start();
  });
  mongoose.connect(dbURI);
}

function start() {
  console.log('bot server started...');
  
  // update topics' feed for the first time
  topicList.forEach(function(topic) {
    topic.getFeed();
  });
    
  // auto update topic's rss feed
  setInterval(function() {
    topicList.forEach(function(topic) {
      topic.update();
    });
  }, 10000);
}

init();


