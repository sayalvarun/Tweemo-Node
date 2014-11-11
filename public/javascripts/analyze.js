function analyzeTweets(data){
	for(i=0; i<data.length; i++){
		var str = data[i]['text'];
		str = str.replace(/@([^\s]+)/g,"").replace(/http([^\s]+)/g,"").replace(/^[\.]/g,"") //Replace @, . & links with whitespace
		if(str.match(/\S*/g).length > 3 && str.split(' ').length>3){ //Ignore extra whitespace tweets created by the replace above
			item = {};
			item['id'] = i;
			item['tweet'] = str;

			var score; //Alchemy Score of the tweet
			var type; //Alchemy Type of the tweet

			alchemyapi.sentiment("text", str, {}, function(response) {
				if(response["docSentiment"]!=undefined){
					score = JSON.stringify(response["docSentiment"]["score"]);
					type = JSON.stringify(response["docSentiment"]["type"]);
					item['score'] = score;
					item['type'] = type;
				}
			});

			console.log(JSON.stringify(item, undefined, 2));
			jsonObject.push(item);
		}
	}
}