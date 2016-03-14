
// TODO: insert values here.
const MEMBERSHIP_ID;
const PLAYER2_ID;
const PLAYER3_ID;
const CHAR_ID;

var request = require('request'),
    moment = require('moment'),
    fs = require('fs');

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
gameDoneEmitter.on('gameDone', function(game) {
    this.gamesDone += 1;
    games.push(game);
    if (this.gamesDone === this.gamesStarted) {
        console.log("Finished!");
        var sorted = games.sort(function(a,b) { 
            return a.date - b.date;
        });
        summarize(sorted);
        saveDetails(sorted);
    }
});

gameDoneEmitter.on('gameStart', function() {
    this.gamesStarted += 1;
});

var summaryUrl = "http://proxy.guardian.gg/Platform/Destiny/Stats/ActivityHistory/1/" + MEMBERSHIP_ID + "/" + CHAR_ID + "/?mode=14&definitions=true&count=100&page=0&lc=en"

function buildPostgameURL(activityId) {
    return "http://proxy.guardian.gg/Platform/Destiny/Stats/PostGameCarnageReport/" + activityId + "/?definitions=false&lc=en";  
}

function buildEloUrl(date, membershipIds) {
    return "http://api.guardian.gg/elo/history/" + membershipIds.join(',') + "?start=" + date + "&end=" + date + "&mode=14";
}

function getElos(gameDetail) {
    console.log("Getting elos for", Object.keys(gameDetail.players));
    var gameDate = gameDetail.date;
    var eloUrl = buildEloUrl(gameDate, Object.keys(gameDetail.players));
    request({
        url: eloUrl,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            body.forEach(function(elo) {
                gameDetail.players[elo.membershipId].elo = elo.elo;
            });

            gameDoneEmitter.emit('gameDone', gameDetail);
        } else {
            console.error("Error: ", eloUrl, response);
        }
    })
}

function calcLightAverage(players) {
    return Math.ceil(players.reduce(function(a,b) { return a + b }) / players.length);
}

function getDetails(match) {
    var url = buildPostgameURL(match.instanceId);
    request({
        url: url,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var details = {
                date: match.date.valueOf(),
                map: match.mapName,
                players: {},
                teams: {}
            }
            var players = body.Response.data.entries.forEach(function(player) {
                var p =  {
                    name: player.player.destinyUserInfo.displayName,
                    membershipId: player.player.destinyUserInfo.membershipId,
                    lightLevel: player.player.lightLevel,
                    teamName: player.values.team.basic.displayValue,
                    assists: player.values.assists.basic.displayValue,
                    kills: player.values.kills.basic.displayValue,
                    deaths: player.values.deaths.basic.displayValue,
                    kdr: player.values.killsDeathsRatio.basic.value
                };

                details.players[p.membershipId] = p;
                
                if (!details.teams[p.teamName]) {
                    details.teams[p.teamName] = {
                        score: player.values.score.basic.displayValue,
                        result: player.values.standing.basic.displayValue,
                        lightLevels: []
                    }
                }
                details.teams[p.teamName].lightLevels.push(p.lightLevel);
            });

            // get the average light level per team
            details.teams["Alpha"].lightLevel = calcLightAverage(details.teams["Alpha"].lightLevels); 
            details.teams["Bravo"].lightLevel = calcLightAverage(details.teams["Bravo"].lightLevels);
            gameDoneEmitter.emit('gameDone', details);
            //getElos(details);
        }
    })
}

// get match summaries
request({
    url: summaryUrl,
    json: true
}, function (error, response, body) {

    if (!error && response.statusCode === 200) {
        console.log("Fetching data for " + body.Response.data.activities.length + " matches...");
        var matches = body.Response.data.activities.map(function(activity) {
            return {
                mapName: body.Response.definitions.activities[activity.activityDetails.referenceId].activityName, 
                instanceId: activity.activityDetails.instanceId, 
                date: moment(activity.period)
            }
        });

        matches.forEach(function(match) {
            gameDoneEmitter.emit("gameStart");
            getDetails(match);
        });
    }
});

function saveDetails(games) {
    var gamesStr = JSON.stringify(games, null, 2);
    fs.writeFile("games.json", gamesStr, function(err) {
        if (err) throw err;
    });
}

function summarize(games) {
    // print out the stats
    var summary = ["Date", "Map", "Matches W", "Matches L", "Match %", "Rounds W", 
                    "Rounds L", "Round %", "My K/D", "P2 K/D", "P3 K/D"];
    var currentMap;
    games.forEach(function(g) {
        if (!currentMap) {
            currentMap = [moment(g.date).format("YYYY-MM-DD"), g.map, 0, 0, 0.0, 0, 0, 0.0, 0, 0, 0];
        } else if(currentMap[1] !== g.map) {
            // calc the win %, and K/Ds for map
            currentMap[4] = Math.floor(currentMap[4] * 100) + "%";
            currentMap[7] = Math.floor(currentMap[7] * 100) + "%";
            var matches = currentMap[2] + currentMap[3];
            currentMap[8] = (currentMap[8] / matches).toFixed(2).toString();
            currentMap[9] = (currentMap[9] / matches).toFixed(2).toString();
            currentMap[10] = (currentMap[10] / matches).toFixed(2).toString();

            summary.push(currentMap);
            currentMap = [moment(g.date).format("YYYY-MM-DD"), g.map, 0, 0, 0.0, 0, 0, 0.0, 0, 0, 0];
        } 

        var ourTeamName = g.players[MEMBERSHIP_ID].teamName;
        var ourTeam = g.teams[ourTeamName], enemyTeam;
        if (ourTeamName === "Alpha") {
            enemyTeam = g.teams.Bravo;
        } else {
            enemyTeam = g.teams.Alpha;
        }

        if (ourTeam.result === "Victory") {
            currentMap[2] += 1;
        } else {
            currentMap[3] += 1;
        }

        currentMap[5] += parseInt(ourTeam.score);
        currentMap[6] += parseInt(enemyTeam.score);

        currentMap[4] = currentMap[2] / (currentMap[2] + currentMap[3]);
        currentMap[7] = currentMap[5] / (currentMap[5] + currentMap[6]);

        currentMap[8] = currentMap[8] + g.players[MEMBERSHIP_ID].kdr;
        currentMap[9] = currentMap[9] + g.players[PLAYER2_ID].kdr;
        currentMap[10] = currentMap[10] + g.players[PLAYER3_ID].kdr;
    });

    currentMap[4] = Math.floor(currentMap[4] * 100) + "%";
    currentMap[7] = Math.floor(currentMap[7] * 100) + "%";
    
    var matches = currentMap[2] + currentMap[3];
    currentMap[8] = (currentMap[8] / matches).toFixed(2).toString();
    currentMap[9] = (currentMap[9] / matches).toFixed(2).toString();
    currentMap[10] = (currentMap[10] / matches).toFixed(2).toString();

    summary.push(currentMap);

    var summaryStr = JSON.stringify(summary, null, 2);
    fs.writeFile("summary.json", summaryStr, function(err) {
        if (err) throw err;
    });
}