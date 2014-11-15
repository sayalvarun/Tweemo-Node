var express = require('express');
var router = express.Router();

// Authenticate app to use Twitter API
var twitter = require('twit');

// Module to support complex async calls
var async = require('async');

//Library used to connect to mysql DB
var mysql      = require('mysql');
var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : '',
  database: 'Tweemo2.0'
});

//Create the AlchemyAPI object
var AlchemyAPI = require('../alchemyapi_node/alchemyapi');
var alchemyapi = new AlchemyAPI();

//Twitter module object
var twit = new twitter({
    consumer_key:         'obpy1PjaH35sNnOztfBhmFyUX'
  , consumer_secret:      'MCM3hcxhiM09htNE9QzeUzSziaw2JsEcXqOas1pPwrGujKCodx'
  , access_token:         '2822318299-taVXDHTl6kqOVKvk6giWP3ftz3rVi6mVQ6Xqns5'
  , access_token_secret:  'EtUKXY6qol06EOmAkgBSxCAvbftJ6D9q3szeX4poTR5No'
})

/* GET tweets page. */
router.get('/:handle', function(req, res) {
	var handle = req.params.handle;
	var content;
	twit.get('statuses/user_timeline', {screen_name:handle, include_rts:'false', count: '3'}, function(err, data, response){	
		insertUser(data[0]); //Store info about user in DB if user not already stored

		parseTweets(data, function(content){ //Parse tweets and render page once done
			res.render('tweets', { title: 'Tweets', data: content});
		});
	});
});

/**
* Take the data response from twitter and parse the tweets for sentiment
* This includes adding it to the JSON to be passed to client and 
* adding a new tweet to the database.
*/
function parseTweets(data, fn){
	var jsonObject = [];
	var count = 0;

	async.eachSeries(data, //Asychronous while loop essentially
		function(item, callback){
			var str = cleanTweet(item['text']);
			
			if(isValidTweet(str)){ //Ignore extra whitespace tweets created by the replace above
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

				insertTweet(item);
			}
		},
		function(err){ //Code that gets executed after every element in data is processed
			fn(jsonObject);
		}
	);
}

/**
* Clean up the tweet text and remove the extra junk
*/
function cleanTweet(tweet){
	tweet = tweet.replace(/@([^\s]+)/g,""); //Remove @ stuff for parsing
	tweet = tweet.replace(/http([^\s]+)/g,""); //Remove links for parsing
	tweet = tweet.replace(/^[\.]/g,"") //Remove .@ messages for parsing
	return tweet;
}

/**
* Checks to see if a tweet is long enough to care
*/
function isValidTweet(tweet){
	return tweet.match(/\S*/g).length > 3 && tweet.split(' ').length>3; //Check if tweet is >3 words ling
}

/**
* Add user to the DB only if the user does not already exist
*/
function insertUser(dataBlock){
	isNewUser(getUserID(dataBlock), function(newUser){
		if(newUser){
			var userData = instantiateUserData(dataBlock);
			var query = "insert into user (userID,Name,Handle,profilePic,numFollowers,location,createDate) "+ 
							"values(?,?,?,?,?,?,?);"; //Parameterized SQL query
			connection.query(query, userData, function(err, rows, fields){
				if(err){
					throw err;
				}
			});
		}
	});
}

/**
* Function to check if the user already exists in the database
*/
function isNewUser(userID, callback){
	var query = 'SELECT * from user '+
				'Where userID = ?';
	connection.query(query, [userID], function(err, rows, fields){
		if (err){
			throw err;
		}
		else{
			if(rows!=undefined && rows.length>0){
				callback(false); //User exists already and was found => not a new user
			}else{
				callback(true); //User does not yet exist
			}
		}
	});
}

/**
* Function to extract the userID of a user from the JSON returned
*/
function getUserID(data){
	return data['user']['id_str'];
}

/**
* Function that initalizes the data that needs to be sent to be added to the DB
*/
function instantiateUserData(data){
	var userData = [];

	userData.push(getUserID(data)); //Twitter ID of the user
	userData.push(data['user']['name']) //Actual name of the user
	userData.push(data['user']['screen_name']); //Twitter handle of the user
	userData.push(data['user']['profile_image_url_https']); //Twitter pro pic URL
	userData.push(data['user']['followers_count']); //Twitter followers of user
	userData.push(data['user']['location']); //TODO: Not sure if this the correct way to get location
	userData.push(formatDate(data['user']['created_at'])); //Date time of tweet

	return userData;
}

/**
* Converts the weird twitter format of the date to MySql status
*/
function formatDate(dateString){
	var splitDate = dateString.split(" ");
	var formattedString = splitDate[5]+'-'; //turned into YYYY-
	formattedString += getNumForm(splitDate[1])+'-'; //YYYY-MM-
	formattedString += splitDate[2]+' '; //YYYY-MM-DD 
	formattedString += splitDate[3];

	return formattedString;
}

/**
* Gets the number representation of a 3-letter month
*/
function getNumForm(month){
	if(month === 'Jan'){
		return '01';
	}
	else if(month === 'Feb'){
		return '02';
	}
	else if(month === 'Mar'){
		return '03';
	}
	else if(month === 'Apr'){
		return '04';
	}
	else if(month === 'May'){
		return '05';
	}
	else if(month === 'Jun'){
		return '06';
	}
	else if(month === 'Jul'){
		return '07';
	}
	else if(month === 'Aug'){
		return '08';
	}
	else if(month === 'Sep'){
		return '09';
	}
	else if(month === 'Oct'){
		return '10';
	}
	else if(month === 'Nov'){
		return '11';
	}
	else{
		return '12'
	}
}

/**
* Add the tweet to our database if it isn't already there
*/
function insertTweet(tData){
	var tweetJson = instantiateTweetData(tData);
	isNewTweet(getTweetID(tData), function(isNew){
		if(isNew){
			var tweetData = instantiateTweetData(tData);
			var query = 'INSERT into tweet (tweetID, userID, text, location, date, favorites, retweets) '+
						'values(?,?,?,?,?,?,?)';
			connection.query(query, tweetData, function(err, rows, fields){
				if(err){
					throw err;
				}
			});
		}
	});
}

/**
* Get the string ID of a particular tweet in a JSON response
*/
function getTweetID(dataBlock){
	return dataBlock['id_str'];
}

/*
* Add the necessary database items to an array and return it for adding
*/
function instantiateTweetData(tData){
	var arr = [];

	arr.push(getTweetID(tData));
	arr.push(tData['user']['id_str']);
	arr.push(tData['text']);
	arr.push(tData['geo']);
	arr.push(formatDate(tData['created_at']));
	arr.push(tData['retweet_count']);
	arr.push(tData['favorite_count']);

	return arr;
}

/**
* Check if a tweet already exists in our database
*/
function isNewTweet(tID, callback){
	var query = 'SELECT * from tweet '+
				'Where tweetID = ?';
	connection.query(query, [tID], function(err, rows, fields){
		if (err){
			throw err;
		}
		else{
			if(rows!=undefined && rows.length>0){
				callback(false); //Tweet exists already and was found => not a new tweet
			}else{
				callback(true); //Tweet does not yet exist
			}
		}
	});
}

module.exports = router;
