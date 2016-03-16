var request = require('request'),
    moment = require('moment'),
    process = require('process'),
    ProgressBar = require('progress'),
    fs = require('fs'),
    csv = require('csv-write-stream');


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
gameDoneEmitter.on('gameDone', function (game) {
    this.gamesDone += 1;
    pBar.tick();
    games.push(game);
    if (this.gamesDone === this.gamesStarted) {
        var sorted = games.sort(function (a, b) {
            return a.date - b.date;
        });

        console.log('\n');

        // build the fireteam
        var team = sorted[0].players[userName].teamName;

        Object.keys(sorted[0].players).forEach(function (p) {
            var player = sorted[0].players[p]
            if (player.teamName === team && player.name != userName) {
                fireteam.push(player.name);
            }
        });

        summarize(sorted);
        saveDetails(sorted);
        console.log("Finished! Data written to ./out/.");
    }
});

gameDoneEmitter.on('gameStart', function () {
    this.gamesStarted += 1;
});


function buildPostgameURL(activityId) {
    return "http://proxy.guardian.gg/Platform/Destiny/Stats/PostGameCarnageReport/" + activityId + "/?definitions=false&lc=en";
}

function buildEloUrl(startDate, endDate, membershipIds) {
    return "http://api.guardian.gg/elo/history/" + membershipIds.join(',')
        + "?start=" + startDate + "&end=" + endDate + "&mode=14";
}

function getElos(gameDetail) {
    var gameDate = moment(gameDetail.date);
    var eloUrl = buildEloUrl(gameDate.format("YYYY-MM-DD"),
        gameDate.add(1, 'days').format("YYYY-MM-DD"),
        Object.keys(gameDetail.players).map(function (p) {
            return gameDetail.players[p].membershipId
        }));

    request({
        url: eloUrl,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            body.forEach(function (elo) {
                var pName = Object.keys(gameDetail.players).filter(function (name) {
                    return gameDetail.players[name].membershipId === elo.membershipId;
                })[0];
                var player = gameDetail.players[pName];
                player.elo = elo.elo;
                gameDetail.teams[player.teamName].elos.push(elo.elo);
            });

            if (gameDetail.teams["Alpha"].elos.length > 0) {
                gameDetail.teams["Alpha"].averageElo = average(gameDetail.teams["Alpha"].elos);
            } else {
                gameDetail.teams["Alpha"].averageElo = 0;
            }
            if (gameDetail.teams["Bravo"].elos.length > 0) {
                gameDetail.teams["Bravo"].averageElo = average(gameDetail.teams["Bravo"].elos);
            } else {
                gameDetail.teams["Bravo"].averageElo = 0;
            }

            gameDoneEmitter.emit('gameDone', gameDetail);
        } else {
            console.error("Error getting elos ", eloUrl, response);
        }
    })
}

function average(arr) {
    return Math.ceil(arr.reduce(function (a, b) {
        return a + b
    }) / arr.length);
}


function getDetails(match) {
    var url = buildPostgameURL(match.instanceId);
    // console.log(url);
    request({
        url: url,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var details = {
                date: match.date.valueOf(),
                id: match.instanceId,
                map: match.mapName,
                players: {},
                teams: {}
            };
            var players = body.Response.data.entries.forEach(function (player) {
                var p = {
                    name: player.player.destinyUserInfo.displayName,
                    membershipId: player.player.destinyUserInfo.membershipId,
                    lightLevel: player.player.lightLevel,
                    teamName: player.values.team.basic.displayValue,
                    assists: player.values.assists.basic.displayValue,
                    kills: player.values.kills.basic.displayValue,
                    deaths: player.values.deaths.basic.displayValue,
                    kdr: player.values.killsDeathsRatio.basic.value
                };

                details.players[p.name] = p;

                if (!details.teams[p.teamName]) {
                    details.teams[p.teamName] = {
                        score: player.values.score.basic.displayValue,
                        result: player.values.standing.basic.displayValue,
                        lightLevels: [],
                        elos: []
                    }
                }
                details.teams[p.teamName].lightLevels.push(p.lightLevel);

            });

            // get the average light level per team
            details.teams["Alpha"].averageLightLevel = average(details.teams["Alpha"].lightLevels);
            details.teams["Bravo"].averageLightLevel = average(details.teams["Bravo"].lightLevels);

            getElos(details);

//            gameDoneEmitter.emit('gameDone', details);
        }
    })
}

function lookupPlayer(userName) {
    // get the membership id and character id
    process.stdout.write("Looking up " + userName + "... ");
    request({
        url: "http://proxy.guardian.gg/Platform/Destiny/SearchDestinyPlayer/1/" + userName + "/",
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var membershipId = body.Response[0].membershipId;
            // console.log("Looking up character " + charIndex + " for " + membershipId);
            request({
                url: "http://proxy.guardian.gg/Platform/Destiny/1/Account/" + membershipId + "/Summary/",
                json: true
            }, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    var characterId = body.Response.data.characters[charIndex].characterBase.characterId;
                    process.stdout.write("OK.\n");
                    getSummary(membershipId, characterId);
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

function getSummary(membershipId, characterId) {
    var summaryUrl = "http://proxy.guardian.gg/Platform/Destiny/Stats/ActivityHistory/1/"
        + membershipId + "/" + characterId + "/?mode=14&definitions=true&count=100&page=0&lc=en";
    // console.log("Summary URL: ", summaryUrl);
    // get match summaries
    request({
        url: summaryUrl,
        json: true
    }, function (error, response, body) {

        if (!error && response.statusCode === 200) {
            pBar = new ProgressBar('Fetching details for :total matches... [:bar] :percent', {
                complete: '=',
                incomplete: ' ',
                width: 30,
                total: body.Response.data.activities.length
            });

            var matches = body.Response.data.activities.map(function (activity) {
                return {
                    mapName: body.Response.definitions.activities[activity.activityDetails.referenceId].activityName,
                    instanceId: activity.activityDetails.instanceId,
                    date: moment(activity.period)
                }
            });

            matches.forEach(function (match) {
                gameDoneEmitter.emit("gameStart");
                getDetails(match);
            });
        } else {
            console.error("Error looking up Trials match summary");
        }
    });
}

function saveDetails(games) {
    var gamesStr = JSON.stringify(games, null, 2);
    fs.writeFile("./out/" + userName + "-games.json", gamesStr, function (err) {
        if (err) throw err;
    });
}

function summarize(games) {
    // print out the stats
    var summary = [];
    var currentMap;
    games.forEach(function (g) {
        if (!currentMap) {
            currentMap = [moment(g.date).format("YYYY-MM-DD"), g.map, 0, 0, 0.0, 0, 0, 0.0, 0, 0, 0];
        } else if (currentMap[1] !== g.map) {
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

        var ourTeamName = g.players[userName].teamName;
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

        currentMap[8] = currentMap[8] + g.players[fireteam[0]].kdr;
        currentMap[9] = currentMap[9] + g.players[fireteam[1]].kdr;
        currentMap[10] = currentMap[10] + g.players[fireteam[2]].kdr;
    });

    currentMap[4] = Math.floor(currentMap[4] * 100) + "%";
    currentMap[7] = Math.floor(currentMap[7] * 100) + "%";

    var matches = currentMap[2] + currentMap[3];
    currentMap[8] = (currentMap[8] / matches).toFixed(2).toString();
    currentMap[9] = (currentMap[9] / matches).toFixed(2).toString();
    currentMap[10] = (currentMap[10] / matches).toFixed(2).toString();

    summary.push(currentMap);


    var writer = csv({ headers: ["Date", "Map", "Matches W", "Matches L", "Match %", "Rounds W",
        "Rounds L", "Round %", fireteam[0] + " K/D", fireteam[1] + " K/D", fireteam[2] + " K/D"]})
    writer.pipe(fs.createWriteStream("./out/" + userName + "-summary.csv"))
    summary.forEach(function (r) {
        writer.write(r);
    });
    writer.end();
}

var args = process.argv.slice(2);
if (args.length < 2) {
    console.error("Need to specify a gamertag and character index ('0' being the character in the top slot).");
    process.exit();
}

var userName = args[0],
    charIndex = args[1];
fireteam = [userName];
var pBar;

if (!fs.existsSync("./out")) {
    fs.mkdirSync("./out");
}

lookupPlayer(userName);
