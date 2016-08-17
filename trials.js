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

        summarize(sorted);
        saveDetails(sorted);
        console.log("Finished!");
    }
});

gameDoneEmitter.on('gameStart', function () {
    this.gamesStarted += 1;
});


function buildPostgameURL(activityId) {
    return "http://proxy.guardian.gg/Platform/Destiny/Stats/PostGameCarnageReport/" + activityId + "/?definitions=false&lc=en";
}

function buildEloUrl(startDate, endDate, membershipIds) {
    return "http://api.guardian.gg/elo/history/" + membershipIds.join(',') + "?start=" + startDate + "&end=" + endDate + "&mode=14";
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
                    kdr: player.values.killsDeathsRatio.basic.value,
                    kadr: player.values.killsDeathsAssists.basic.value
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

            gameDoneEmitter.emit('gameDone', details);
        }
    })
}

const classes = ["Titan", "Hunter", "Warlock"];

function lookupPlayer(userName) {
    // get the membership id and character id
    process.stdout.write("Looking up " + userName + "... ");
    request({
        url: "http://proxy.guardian.gg/Platform/Destiny/SearchDestinyPlayer/1/" + userName + "/",
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var membershipId = body.Response[0].membershipId;
            request({
                url: "http://proxy.guardian.gg/Platform/Destiny/1/Account/" + membershipId + "/Summary/",
                json: true
            }, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    var chars = body.Response.data.characters.map(function (c) {
                        return {
                            characterId: c.characterBase.characterId,
                            classType: classes[c.characterBase.classType]
                        };
                    });

                    process.stdout.write("OK.\n");
                    getSummary(membershipId, chars);

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

function getGames(membershipId, characterId, finishedCallback, previousDate, matches, page) {
    // get pages until we can't get anymore
    matches = matches || [];
    page = page || 0;
    var summaryUrl = "http://proxy.guardian.gg/Platform/Destiny/Stats/ActivityHistory/1/"
        + membershipId + "/"
        + characterId + "/?mode=14&definitions=true&count=50"
        + "&page=" + page + "&lc=en";

    request({
        url: summaryUrl,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            if (Object.keys(body.Response.data).length === 0) {
                // we're done!  return what we've got
                finishedCallback(matches);
            } else {
                matches = matches.concat(body.Response.data.activities.map(function (activity) {
                    return {
                        mapName: body.Response.definitions.activities[activity.activityDetails.referenceId].activityName,
                        instanceId: activity.activityDetails.instanceId,
                        date: moment(activity.period)
                    }
                }));

                getGames(membershipId, characterId, finishedCallback, previousDate, matches, ++page);
            }
        } else {
            console.error("Error looking up Trials match summary");
        }
    });
}

function getSummary(membershipId, characters) {
    var matches = [];

    var charsCompleted = 0;

    characters.forEach(function (c, i) {
        getGames(membershipId, c.characterId, function (results) {
            matches = matches.concat(results);
            charsCompleted += 1;
            if (charsCompleted === characters.length) {

                var matchesToFetch = [];
                matches.sort(function(a,b) { return b.date - a.date; })
                    .some(function(m) {
                        if (lastActivityId) {
                            if (m.instanceId !== lastActivityId) {
                                matchesToFetch.push(m);
                            }
                            return m.instanceId === lastActivityId;
                        } else {
                            matchesToFetch.push(m);
                            return false;
                        }
                    });

                pBar = new ProgressBar('Fetching details for :total matches... [:bar] :percent', {
                    complete: '=',
                    incomplete: ' ',
                    width: 30,
                    total: matchesToFetch.length
                });

                if (matchesToFetch.length > 0) {
                    matchesToFetch.forEach(function (match) {
                        gameDoneEmitter.emit("gameStart");
                        getDetails(match);
                    });
                } else {
                    console.log("No new games to fetch.");
                }
            }

        });
    });

}

function saveDetails(games) {
    var gamesStr = JSON.stringify(games, null, 2);
    fs.writeFile(gameFilename, gamesStr, function (err) {
        if (err) throw err;
    });
}

function initMapObject(date, map) {
    return {
        date: moment(date).format("YYYY-MM-DD"),
        map: map,
        matchWins: 0,
        matchLosses: 0,
        matchRatio: 0.0,
        roundWins: 0,
        roundLosses: 0,
        roundRatio: 0.0,
        playerKD: 0,
        playerKAD: 0
    };
}

function summarize(games) {
    // print out the stats
    var summary = [];
    var currentMap;
    games.forEach(function (g) {
        if (!currentMap) {
            currentMap = initMapObject(g.date, g.map);
        } else if (currentMap.map !== g.map) {
            // calc the win %, and K/Ds for map
            currentMap.matchRatio = Math.floor(currentMap.matchRatio * 100) + "%";
            currentMap.roundRatio = Math.floor(currentMap.roundRatio * 100) + "%";

            var matches = currentMap.matchWins + currentMap.matchLosses;
            currentMap.playerKD = (currentMap.playerKD / matches).toFixed(2).toString();
            currentMap.playerKAD = (currentMap.playerKAD / matches).toFixed(2).toString();

            summary.push(currentMap);
            currentMap = initMapObject(g.date, g.map);
        }

        var ourTeamName = g.players[userName].teamName;
        var ourTeam = g.teams[ourTeamName],
            enemyTeam;
        if (ourTeamName === "Alpha") {
            enemyTeam = g.teams.Bravo;
        } else {
            enemyTeam = g.teams.Alpha;
        }

        if (ourTeam.result === "Victory") {
            currentMap.matchWins += 1;
        } else {
            currentMap.matchLosses += 1;
        }

        currentMap.roundWins += parseInt(ourTeam.score);
        currentMap.roundLosses += parseInt(enemyTeam.score);

        currentMap.matchRatio = currentMap.matchWins / (currentMap.matchWins + currentMap.matchLosses);
        currentMap.roundRatio = currentMap.roundWins / (currentMap.roundWins + currentMap.roundLosses);

        currentMap.playerKD += g.players[userName].kdr;
        currentMap.playerKAD += g.players[userName].kadr;

    });

    currentMap.matchRatio = Math.floor(currentMap.matchRatio * 100) + "%";
    currentMap.roundRatio = Math.floor(currentMap.roundRatio * 100) + "%";

    var matches = currentMap.matchWins + currentMap.matchLosses;
    currentMap.playerKD = (currentMap.playerKD / matches).toFixed(2).toString();
    currentMap.playerKAD = (currentMap.playerKAD / matches).toFixed(2).toString();

    summary.push(currentMap);

    var writer = csv({
        headers: ["Date", "Map", "Matches W", "Matches L", "Match %", "Rounds W",
            "Rounds L", "Round %", "K/D", "K+A/D"
        ]
    });

    writer.pipe(fs.createWriteStream("./out/" + userName + ".summary.csv"));
    summary.forEach(function (r) {
        writer.write([r.date, r.map, r.matchWins, r.matchLosses, r.matchRatio, r.roundWins, r.roundLosses, r.roundRatio, r.playerKD, r.playerKAD]);
    });
    writer.end();
}

var args = process.argv.slice(2);
if (args.length < 1) {
    console.error("Need to specify a gamertag.");
    process.exit();
}

var userName = args[0];
var gameFilename = "./out/" + userName + ".games.json";
var lastActivityId;
try {
    fs.accessSync(gameFilename, fs.F_OK);
    var prevGames = require(gameFilename);
    var sorted = prevGames.sort(function(a,b) { return b.date - a.date; });
    games = prevGames;
    lastActivityId = sorted[0].id;
} catch (e) {
    console.warn("No previous games found, fetching all games for " + userName + ".");
}

var pBar;

if (!fs.existsSync("./out")) {
    fs.mkdirSync("./out");
}

lookupPlayer(userName);