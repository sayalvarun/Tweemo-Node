var express = require('express');
var router = express.Router();

// Authenticate app to use Twitter API
var twitter = require('twit');

var async = require('async');

//Create the AlchemyAPI object
var AlchemyAPI = require('../alchemyapi_node/alchemyapi');
var alchemyapi = new AlchemyAPI();

var twit = new twitter({
    consumer_key:         'obpy1PjaH35sNnOztfBhmFyUX'
  , consumer_secret:      'MCM3hcxhiM09htNE9QzeUzSziaw2JsEcXqOas1pPwrGujKCodx'
  , access_token:         '2822318299-taVXDHTl6kqOVKvk6giWP3ftz3rVi6mVQ6Xqns5'
  , access_token_secret:  'EtUKXY6qol06EOmAkgBSxCAvbftJ6D9q3szeX4poTR5No'
})

/* GET home page. */
router.get('/', function(req, res) {
	var content;
	twit.get('statuses/user_timeline', {screen_name:'ConanOBrien', include_rts:'false', count: '50'}, function(err, data, response){
		console.log()
		var jsonObject = [];
		var count = 0;
		async.eachSeries(data,
			function(item, callback){
				var str = item['text'];
				str = str.replace(/@([^\s]+)/g,"").replace(/http([^\s]+)/g,"").replace(/^[\.]/g,"") //Replace @, . & links with whitespace
				if(str.match(/\S*/g).length > 3 && str.split(' ').length>3){ //Ignore extra whitespace tweets created by the replace above
					tweetObj = {};
					tweetObj['id'] = count;
					tweetObj['tweet'] = str;

					var score; //Alchemy Score of the tweet
					var type; //Alchemy Type of the tweet

					alchemyapi.sentiment("text", str, {}, function(response) {
						if(response["docSentiment"]!=undefined){
							score = JSON.stringify(response["docSentiment"]["score"]);
							type = JSON.stringify(response["docSentiment"]["type"]);
							tweetObj['score'] = score;
							tweetObj['type'] = type;
							jsonObject.push(tweetObj);
							count++;
						}
						callback();
					});
				}
			},
			function(err){
				content = jsonObject;
				res.render('index', { title: 'Tweets', data: content});
			}
		);
	});
});

module.exports = router;
