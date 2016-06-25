var mongoose = require( 'mongoose' );

var chatSchema = mongoose.Schema({
  id: String,
  language: String,
  topics: [String]
});

var Chat = mongoose.model( 'Chat', chatSchema );

module.exports = Chat;