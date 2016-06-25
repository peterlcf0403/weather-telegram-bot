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
// list of supported languages
var supportedLang = ['eng', 'cht', 'chs'];
// uri for mongoose database
var dbURI = 'mongodb://root:root@ds023714.mlab.com:23714/weather-bot';


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
  this.data = {
    eng: 'No content available now.',
    cht: '暫無內容',
    chs: '暂无内容'
  };
  
  // the time of the feed source last update
  this.lastPublish = {
    eng: null,
    cht: null,
    chs: null
  };
  
  // the time of the last attempt to get the feed
  this.lastFeed = null;
}

Topic.prototype = {
  
  // get rss feed of the topic
  getFeed: function() {
    var topic = this;
    try {
      for (var name in topic.url) {
        if (topic.url.hasOwnProperty(name)) {
          feed(topic.url[name], function() {
            var lang = name;
            return function(err, rss) {
              if (err) throw err;
              console.log('Received feed of topic ['+ topic.name +'] in language ['+ lang +']...');
              
              // check if the rss feed is updated
              var date = rss[0].published;
              if (topic.lastPublish[lang] != null && date.getTime() == topic.lastPublish[lang].getTime()) {
                console.log('\tNo update.');
              } else {
                console.log('\tcontent updated!');
                
                // parse rss feed and update publish time
                topic.lastPublish[lang] = date;
                if (typeof topic.parser == 'function')
                  topic.data[lang] = topic.parser(rss);
                else
                  topic.data[lang] = rss[0].content;
                
                console.log(topic.data[lang]);
                
                // send updates to chats
                topic.subs.forEach(function(sub){
                  if (sub.lang == lang)
                    bot.sendMessage(sub.id, topic.data[lang]);
                });
              }
            }
          }());
        }
      }
      // update last feed time
      topic.lastFeed = new Date();
      
    } catch (err) {
      console.log(err);
    }
  },
  
  // add chat into topic's subscribe list
  subscribe: function(chat, callback) {
    try {
      var topic = this;
      
      // check if chat already subscribed the topic
      if (chat.topics.indexOf(topic.name) == -1) {
        
        // new subscriber. update chat's topic list
        chat.topics.push(topic.name);
        chat.save(function(err) {
          if (err) throw err;
          
          // update topic's subscriber list
          var sub = topic.subs.find(function(e) { return e.id == chat.id });
          if (sub === undefined) {
            topic.subs.push({id: chat.id, lang: chat.language});
          }
          callback(null, true);
          console.log('New subscriber to topic ['+ topic.name +']');
        });
      } else {
        // already subscribed
        callback(null, false);
      }
    } catch (err) {
      console.log(err);
      callback(err);
    }
  },
  
  // remove chat from topic's subscribe list
  unsubscribe: function(chat, callback) {
    var topic = this;
    try {
      // check if chat already subscribed the topic
      var index = chat.topics.indexOf(topic.name);
      if (index == -1) {
        // not subscribe yet
        callback(null, false);
      } else {
        // is subscribed. remove the topic
        chat.topics.splice(index, 1);
        chat.save(function(err) {
          if (err) throw err;
          var index = topic.subs.findIndex(function(e) { return e.id == chat.id});
          if (index != -1) {
            topic.subs.splice(index, 1);
          }
          callback(null, true);
          console.log('A subscriber is left from topic ['+ topic.name +']');
        });
      }
    } catch (err) {
      console.log(err);
      callback(err);
    }
  }

};

// check if chat exist. if not, add new chat to database
function checkUser(id, callback) {
  Chat.find({id: id}, function(err, res) {
    if (err) return callback(err);
    if (res.length)
      // chat already exist
      callback(null, res[0]);
    else {
      // chat does not exist. create a new entry
      var chat = new Chat({
        id: id, 
        language: 'eng',
        topics: []
      });
      chat.save(function(err) {
        if (err) 
          callback(err);
        else 
          callback(null, chat);
      });
    }
  });
}


// rss feed parsers
function currentRssParser(rss) {
  // scrap wanted part from content
  let $ = cheerio.load(rss[0].content);
  var child = $('p')[0].children;
  
  // reformate each line
  var result = '';
  for (let i=0; i<child.length; i++) {
    if (child[i].type == 'text') {
      let str = child[i].data.trim().replace(/[\s\r\n]+/g, ' ');
      if (str != '') {
        if (i > 0) result += '\n   ';
        result += str;
      }
    }
  }
  return result;
}

function warningRssParser(rss) {
  // remove html tags
  return rss[0].content.replace(/<[^>]*>/g, '').trim();
}


// topic update handlers
function currentUpdateHandler() {
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

function warningUpdateHandler() {
  var currentTime = new Date();
  // update every 30s
  var interval = 30000;
  if (currentTime.getTime() - this.lastFeed.getTime() > interval) {
    this.getFeed();
  }
}


// command handlers
function topicCmdHandler(msg, match) {
  console.log('[topic] command received: ' + match[0]);
  bot.sendMessage(msg.chat.id, topicList.map(function(e){ return e.name }).join(', '));
}

function tellmeCmdHandler(msg, match) {
  console.log('[tellme] command received: ' + match[0]);
  try {
    checkUser(msg.chat.id, function(err, chat){
      if (err) throw err;
      var name = match[1];
      var topic = topicList.find(function(e) { return e.name === name; });
      if (topic === undefined) {
        bot.sendMessage(chat.id, 'Topic not found!\nType \'topic\' to see available topics.');
      } else {
        bot.sendMessage(chat.id, topic.data[chat.language]);
      }
    });
  } catch (err) {
    console.log(err);
  }
}

function subscribeCmdHandler(msg, match) {
  console.log('[subscribe] command received: ' + match[0]);
  try {
    checkUser(msg.chat.id, function(err, chat) {
      if (err) throw err;
      var name = match[1];
      var topic = topicList.find(function(e) { return e.name === name; });
      if (topic === undefined) {
        bot.sendMessage(chat.id, 'Topic \'' + name + '\' not found!\nType \'topic\' to see available topics.');
      } else {
        topic.subscribe(chat, function(err, res){
          if (err)
            bot.sendMessage(chat.id, 'Error occured! Please try it later.');
          else if (res)
            bot.sendMessage(chat.id, 'Subscribe successfully!');
          else
            bot.sendMessage(chat.id, 'You are already subscribed to the topic!');
        });
      }
    });
  } catch (err) {
    console.log(err);
  }
}

function unsubscribeCmdHandler(msg, match) {
  console.log('[unsubscribe] command received: ' + match[0]);
  try {
    checkUser(msg.chat.id, function(err, chat) {
      if (err) throw err;
      var name = match[1];
      var topic = topicList.find(function(e) { return e.name === name; });
      if (topic === undefined) {
        bot.sendMessage(chat.id, 'Topic \'' + name + '\' not found!\nType \'topic\' to see available topics.');
      } else {
        topic.unsubscribe(chat, function(err, res) {
          if (err)
            bot.sendMessage(chat.id, 'Error occured! Please try it later.');
          else if (res)
            bot.sendMessage(chat.id, 'Unsubscribe successfully!');
          else
            bot.sendMessage(chat.id, 'You did not subscribe to this topic before!');
        });
      }
    });
  } catch (err) {
    console.log(err);
  }
}

function languageCmdHandler(msg, match){
  console.log('[language] command received: ' + match[0]);
  try {
    checkUser(msg.chat.id, function(err, chat){
      if (err) throw err;
      var lang = match[1];
      if (supportedLang.indexOf(lang) == -1) {
        bot.sendMessage(chat.id, 
          'Language not supported! Supported languages are\n' +
          '  eng: English\n' +
          '  cht: 繁體中文\n' +
          '  chs: 简体中文'
        );
      } else {
        chat.language = lang;
        chat.save(function (err){
          if (err) throw err;
          topicList.forEach(function(topic) {
            var sub = topic.subs.find(function(e) { return e.id == chat.id });
            if (sub !== undefined) sub.lang = lang;
          });
          var msg = { 
            eng: 'OK. Feeds will be shown in English.', 
            cht: '好的. 訂閱將以繁體中文顯示', 
            chs: '好的. 订阅将以简体中文显示'
          };
          bot.sendMessage(chat.id, msg[lang]);
        });
      }
    });
  } catch (err) {
    bot.sendMessage(chat.id, 'Error occured!');
    console.log(err);
  }
}


// server initialization
function init() {

  topicList = [];
  
  // create topic objects
  // topic 'current'
  topicList.push( new Topic(
    'current',
    {
      eng: 'http://rss.weather.gov.hk/rss/CurrentWeather.xml',
      cht: 'http://rss.weather.gov.hk/rss/CurrentWeather_uc.xml',
      chs: 'http://gbrss.weather.gov.hk/rss/CurrentWeather_uc.xml'
    }, 
    currentRssParser,
    currentUpdateHandler
  ));
  
  // topic 'warning'
  topicList.push( new Topic(
    'warning',
    {
      eng: 'http://rss.weather.gov.hk/rss/WeatherWarningSummaryv2.xml',
      cht: 'http://rss.weather.gov.hk/rss/WeatherWarningSummaryv2_uc.xml',
      chs: 'http://gbrss.weather.gov.hk/rss/WeatherWarningSummaryv2_uc.xml'
    },
    warningRssParser,
    warningUpdateHandler
  ));
  
  
  // database connection
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
              topicList[i].subs.push({id: chat.id, lang: chat.language});
              break;
            }
          }
        });
      });
    });
    console.log('Finished reading subscribers');
  
    // setting up command listeners
    // 'topic' command listener
    bot.onText(/^topic$/, topicCmdHandler);
    // 'tellme' command listener
    bot.onText(/^tellme (.+)$/, tellmeCmdHandler);
    // 'subscribe' command listener
    bot.onText(/^subscribe (.+)$/, subscribeCmdHandler);
    // 'unsubscribe' command listener
    bot.onText(/^unsubscribe (.+)$/, unsubscribeCmdHandler);
    // 'language' command listener
    bot.onText(/^language (.+)$/, languageCmdHandler);
    
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
  }, 5000);
}

init();


