var utils = require('./utils');
var request = require('request'),
    moment = require('moment'),
    process = require('process');

const EventEmitter = require('events'),
    util = require('util');

function GameDoneEmitter() {
    this.gamesStarted = 0;
    this.gamesDone = 0;
    EventEmitter.call(this);
}
util.inherits(GameDoneEmitter, EventEmitter);

var games = [];

const gameDoneEmitter = new GameDoneEmitter();
gameDoneEmitter.on('gameStart', function () {
    this.gamesStarted += 1;
});

gameDoneEmitter.on('gameDone', function (game) {
    this.gamesDone += 1;
    pBar.tick();
    games.push(game);
    if (this.gamesDone === this.gamesStarted) {
        console.log('\n');
        getCombatRatingStats(games);
        console.log("Finished!");
    }
});

// lookup the player (and all characters)
function lookupPlayer(userName, cb) {
    // get the membership id and character id
    process.stdout.write("Looking up " + userName + "... ");
    request({
        url: "http://proxy.guardian.gg/Platform/Destiny/SearchDestinyPlayer/1/" + userName + "/",
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var ret = {
                membershipId: body.Response[0].membershipId,
                chars: []
            };

            request({
                url: "http://proxy.guardian.gg/Platform/Destiny/1/Account/" + membershipId + "/Summary/",
                json: true
            }, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    ret.chars = body.Response.data.characters.map(function (c) {
                        return {
                            characterId: c.characterBase.characterId,
                            classType: classes[c.characterBase.classType]
                        };
                    });

                    process.stdout.write("OK.\n");
                    cb(ret);

                } else {
                    process.stdout.write("Error!\n");
                    console.error(error);
                }
            })

        } else {
            process.stdout.write("Error!\n");
            console.error(error);
        }
    });
}

// get all matches for all types (minus trials)
//  - group them by "mode"
function getGamesForChar(membershipId, characterId, finishedCallback, matches, page) {
    // get pages until we can't get anymore
    matches = matches || [];
    page = page || 0;
    var summaryUrl = "http://proxy.guardian.gg/Platform/Destiny/Stats/ActivityHistory/1/"
        + membershipId + "/"
        + characterId + "/?mode=AllPvP&definitions=true&count=50"
        + "&page=" + page + "&lc=en";

    request({
        url: summaryUrl,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            // 200 should be plenty
            if (Object.keys(body.Response.data).length === 0 || matches.length >= 200) {
                // we're done!  return what we've got
                var sorted = matches.sort(function (a, b) {
                    return a.date - b.date;
                });
                finishedCallback(sorted);
            } else {
                matches = matches.concat(body.Response.data.activities.filter(function(a) {
                    return a.activityDetails.mode != utils.activities.TRIALS;
                }).map(function (activity) {
                    return {
                        instanceId: activity.activityDetails.instanceId,
                        date: moment(activity.period)
                    }
                }));

                getGames(membershipId, characterId, finishedCallback, matches, ++page);
            }
        } else {
            console.error("Error looking up character games");
        }
    });
}

// for each match in mode
//  - get my combat rating
//  - average combat rating of everyone else
//  - if team mode
//    - get average of other team members
//    - get average of enemy team members
//  - Response.data.entries[].extended.combatRating.basic.value
//  - Response.data.entries[].player.destiyUserInfo.displayName
function getData(match) {
    gameDoneEmitter.emit('gameDone', gameDetail);
}

function getCombatRatingStats(games) {

}

var args = process.argv.slice(2);
if (args.length < 1) {
    console.error("Need to specify a gamertag.");
    process.exit();
}

var userName = args[0];

lookupPlayer(userName, function(userObj) {
   userObj.chars.forEach(function(char) {
       getGamesForChar(userObj.membershipId, char.characterId, function(games) {
           games.forEach(function(game) {
               getData(game);
           })
       });
   })
});


