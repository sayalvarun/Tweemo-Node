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
	var oldestTweetID; //Store the ID of the oldest Tweet of handle stored in DB
	var newestTweetID; //Store the ID of the newest Tweet of handle stored in DB

	getTweetLimits(handle, function(limits){ //Get the oldest and newest know tweetID
		oldestTweetID = limits[0];
		newestTweetID = limits[1];
		console.log("Old ID: "+oldestTweetID)
		console.log("New ID: "+newestTweetID)

		async.series([ //Execute following functions in order
				function(callback){ //Get tweets before known tweets
					console.log("Getting old tweets");
					if(oldestTweetID!=undefined){
						twit.get('statuses/user_timeline', {screen_name:handle, include_rts:'false', count: '5', max_id:oldestTweetID}, function(err, data, response){
							if(data != ''){
								insertUser(data[0],function(){ //Store info about user in DB if user not already stored
									parseTweets(data, function(content){ //Parse tweets
										console.log("Now parsing old tweets") 
										//console.log("Old Tweet Contribution: "+JSON.stringify(content,undefined,2))
										callback(null, content);
									});
								});
							}	
						});
					}
					callback(null, []);
				},
				function(callback){ //Get known tweets
					console.log("Getting known tweets");
					getKnownTweets(handle, function(content){
						//console.log("Know tweet Contribution: "+ JSON.stringify(content,undefined,2))
						callback(null, content);
					});
				},
				function(callback){ //Get tweets after known tweets
					console.log("Getting new tweets");
					if(newestTweetID!=undefined){
						twit.get('statuses/user_timeline', {screen_name:handle, include_rts:'false', count: '5', since_id:newestTweetID}, function(err, data, response){
							console.log("New Data: "+data)
							if(data != ''){
								insertUser(data[0], function(){ //Store info about user in DB if user not already stored
									parseTweets(data, function(content){ //Parse tweets 
										//console.log("Unknown Tweets Contribution: "+JSON.stringify(content,undefined,2))
										callback(null, content);
									});
								});
							}	
						});
					}
					else{
						twit.get('statuses/user_timeline', {screen_name:handle, include_rts:'false', count: '5'}, function(err, data, response){
							if(data != ''){
								console.log("Parsing tweets")
								insertUser(data[0], function(){
									console.log("User Precessed")
									parseTweets(data, function(content){ //Parse tweets
										callback(null, content);
									});
								});
							}	
						});
					}
				}
			],
			function(err, results){ //Once all tweets parsed
				mergeContents(results, function(content){
					//console.log(JSON.stringify(content, undefined, 2));
					res.render('tweets', { title: 'Tweets', data: content});
				});
			}
		);
	});
});

/**
* Get all the known tweets from a user and their respective sentiment information
*/
function getKnownTweets(handle, callback){
	var query = 'select T.text, S.score, S.type from tweet T, '+
				'user U, Sentiment S where T.userID = U.userID and T.tweetID = S.tweetID '+
				'and U.handle = ? order by T.tweetID;';
	connection.query(query, [handle], function(err, rows, fields){
		if(err){
			throw err;
		}
		console.log(JSON.stringify(rows, undefined,2))
		callback(rows);
	});
}

/**
* Method to merge mutliple JSON's into 1 json
*/
function mergeContents(combination, callback){
	var total = [];
	for(i=0; i<combination.length; i++){
		if(combination[i]!=undefined){
			//console.log("Current row: "+JSON.stringify(combination[i], undefined, 2))
			total = total.concat(combination[i]);
		}
	}
	callback(total);
}

/**
* Query the DB for the tweets of a particular handle with minimum and maximum
* twitterID so we know to only ask Twitter for new tweets
*/
function getTweetLimits(handle, fn){
	var query = 'select tweetID from tweet T, '+
				'user U where T.userID = U.userID '+
				'and U.handle = ? order by tweetID;';

	connection.query(query, [handle], function(err, rows, fields){
		if(err){
			throw err;
		}
		if(rows.length>0){
			async.series([
					function(callback){
						callback(null, rows[0]['tweetID']);
					},
					function(callback){
						callback(null, rows[rows.length-1]['tweetID']);
					}
				],
				function(err, results){
					fn(results);
				}
			);
		}
		else{ //No tweets for this user
			fn([undefined,undefined]);
		}	
	});
}

/**
* Take the data response from twitter and parse the tweets for sentiment
* This includes adding it to the JSON to be passed to client and 
* adding a new tweet to the database.
*/
function parseTweets(data, fn){
	var jsonObject = [];
	var count = 0;
	console.log("Parsing Old Tweets")
	async.eachSeries(data, //Asychronous for each loop essentially
		function(item, callback){
			var str = cleanTweet(item['text']);
			//console.log(str)
			
			if(isValidTweet(str)){ //Ignore extra whitespace tweets created by the replace above
				tweetObj = {};
				tweetObj['id'] = item['id_str'];
				tweetObj['text'] = str;

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
					insertTweet(item, tweetObj, function(){
						console.log("Tweet Inserted!")
						callback()
					});
				});
			}else{
				callback()
			}
		},
		function(err){ //Code that gets executed after every element in data is processed
			console.log("Tweets processed")
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
	tweet = tweet.replace(/\&([^\s]+)/g,"")//Remove ampersands
	tweet = tweet.replace("\n","")//Remove line breaks
	return tweet;
}

/**
* Checks to see if a tweet is long enough to care
*/
function isValidTweet(tweet){
	console.log("The tweet is: "+tweet)
	console.log("The length of which is: "+tweet.split(" ").length)
	console.log("The validity of which is: "+ parseInt(tweet.split(" ").length) >3)
	return tweet.split(" ").length > 3; //Check if tweet is >3 words long
}

/**
* Add user to the DB only if the user does not already exist
*/
function insertUser(dataBlock, callback){
	console.log("adding user!");
	isNewUser(getUserID(dataBlock), function(newUser){
		if(newUser){
			console.log("New user added")
			var userData = instantiateUserData(dataBlock);
			var query = "insert into user (userID,Name,Handle,profilePic,numFollowers,location,createDate) "+ 
							"values(?,?,?,?,?,?,?);"; //Parameterized SQL query
			connection.query(query, userData, function(err, rows, fields){
				if(err){
					throw err;
				}
			});
		}
		else{
			console.log("User Already Exists!")
		}
		callback()
	});
}

/**
* Function to check if the user already exists in the database
*/
function isNewUser(userID, callback){
	console.log("Checking for a new user");
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
* Add the tweet to our database
* @precondition the tweet has to be new if it reached here
*/
function insertTweet(tData, tweetObj, callback){
	console.log("Inserting a tweet")
	isNewTweet(getTweetID(tData), function(isNew){
		if(isNew){
			var tweetData = instantiateTweetData(tData);
			var query = 'INSERT into tweet (tweetID, userID, text, location, date, favorites, retweets) '+
						'values(?,?,?,?,?,?,?)';
			connection.query(query, tweetData, function(err, rows, fields){
				if(err){
					console.log(tweetData)
					throw err;
				}
				insertSentiment(tweetObj, function(){
					callback();
				});
			});
		}
		else{
			callback()
		}
	});
}

/**
* Sentiment should be a new one else duplicates will accumulate in DB table
* insert these sentiment records into sentiment table
*/
function insertSentiment(tweetObj, callback){
	
	if (tweetObj['type']==undefined){
		tweetObj['type']='neutral' 
	}
	var sentData = [tweetObj['id'],tweetObj['score'],tweetObj['type']]; //Easy 3 col. initialization
	var query = 'INSERT into sentiment (tweetID, score, type) '+
				'values(?,?,?)';
	connection.query(query, sentData, function(err, rows, fields){
		if(err){
			console.log(sentData)
			throw err;
		}
		callback()
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
	arr.push(cleanTweet(tData['text']));
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
