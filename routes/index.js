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

var twit = new twitter({
    consumer_key:         'obpy1PjaH35sNnOztfBhmFyUX'
  , consumer_secret:      'MCM3hcxhiM09htNE9QzeUzSziaw2JsEcXqOas1pPwrGujKCodx'
  , access_token:         '2822318299-taVXDHTl6kqOVKvk6giWP3ftz3rVi6mVQ6Xqns5'
  , access_token_secret:  'EtUKXY6qol06EOmAkgBSxCAvbftJ6D9q3szeX4poTR5No'
})

/* GET home page. */
router.get('/', function(req, res) {
	var content;
	twit.get('statuses/user_timeline', {screen_name:'burnie', include_rts:'false', count: '20'}, function(err, data, response){
		
		insertUser(data[0]); //Store info about user in DB if user not already stored

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

/**
* Add user to the DB
*/
function insertUser(dataBlock){

	var userData = instantiateUserData(dataBlock);
	var query = "insert into user (userID,Name,Handle,profilePic,numFollowers,location,createDate) "+ 
					"values(?,?,?,?,?,?,?);"; //Parameterized SQL query
	connection.query(query, userData, function(err, rows, fields){
		if(err){
			throw err;
		}
	});
}

function instantiateUserData(data){
	var userData = [];

	userData.push(data['id_str']); //Twitter ID of the user
	userData.push(data['user']['name']) //Actual name of the user
	userData.push(data['user']['screen_name']); //Twitter handle of the user
	userData.push(data['user']['profile_image_url_https']); //Twitter pro pic URL
	userData.push(data['user']['followers_count']); //Twitter followers of user
	userData.push(data['geo']); //TODO: Not sure if this the correct way to get location
	userData.push(formatDate(data['created_at'])); //Date time of tweet

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

module.exports = router;
