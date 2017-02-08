var process = require('process'),
    moment = require('moment'),
    request = require('request'),
    csv = require('csv-write-stream');

var args = process.argv.slice(2);
if (args.length < 2) {
    console.error("Need to specify a gamertag and character index ('0' being the character in the top slot).");
    process.exit();
}

var userName = args[0];

var fs = require('fs'),
    csv = require('csv-write-stream');

// Array.find polyfill
if (!Array.prototype.find) {
  Array.prototype.find = function(predicate) {
    'use strict';
    if (this == null) {
      throw new TypeError('Array.prototype.find called on null or undefined');
    }
    if (typeof predicate !== 'function') {
      throw new TypeError('predicate must be a function');
    }
    var list = Object(this);
    var length = list.length >>> 0;
    var thisArg = arguments[1];
    var value;

    for (var i = 0; i < length; i++) {
      value = list[i];
      if (predicate.call(thisArg, value, i, list)) {
        return value;
      }
    }
    return undefined;
  };
}

function getEloLightChart() {
    var games = loadGames(userName);

    var writer = csv({ headers: ["Map", "Our Elo", "Enemy Elo", "Elo Diff", "Our Score", "Enemy Score", "Result"] });
    writer.pipe(fs.createWriteStream("./data/" + userName + ".elolight.csv"));

    games.forEach(function(g) {
        var myTeamName = g.players[userName].teamName;
        var enemyName = (myTeamName === 'Alpha' ? 'Bravo' : 'Alpha');
        var myTeam = g.teams[myTeamName],
            enemyTeam = g.teams[enemyName];

        var data = [g.map, myTeam.averageElo, enemyTeam.averageElo,
            (myTeam.averageElo - enemyTeam.averageElo),
            myTeam.score,
            enemyTeam.score,
            (myTeam.result === 'Defeat' ? 'L' : 'W')
        ];

        writer.write(data);

    });

    writer.end();
}

//getEloLightChart();

function loadGames(username) {
    try {
        var fname = "./data/" + username + ".games.json";
        fs.accessSync(fname, fs.F_OK);
        return require(fname);
    } catch (e) {
        return null
    }
}

function average(arr) {
    arr = arr.filter(function(a) { return a != undefined });
    return Math.ceil(arr.reduce(function(a, b) {
        return a + b
    }) / arr.length);
}

function getPlayerElos(callback) {
    var games = loadGames(userName);

    var players = {},
        startDate, endDate;

    games.forEach(function(g) {
        if (!startDate) {
            startDate = moment(g.date),
                endDate = startDate.clone().add(1, "days");
        }
        Object.keys(g.players).forEach(function(p) {
            var pKey = g.players[p].membershipId;
            if (!players[pKey]) {
                players[pKey] = {
                    name: p
                }
            }
        })
    });

    request({
        url: "http://api.guardian.gg/elo/history/" + Object.keys(players).join(',')
            + "?start=" + startDate.format("YYYY-MM-DD")
            + "&end=" + endDate.format("YYYY-MM-DD") + "&mode=14",
        json: true
    }, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            var elos = body.filter(function(e) {
                return e.date === endDate.format("YYYY-MM-DD");
            }).forEach(function(e) {
                players[e.membershipId].elo = e.elo;
            });

            // players is now up to date with the ELOs

            var writer = csv({ headers: ["Date", "Map", "Our Elo", "Enemy Elo", "Elo Diff", "Our Score", "Enemy Score", "Result"] });
            writer.pipe(fs.createWriteStream("./data/" + userName + "-elos.csv"));

            games.forEach(function(g) {
                var myTeamName = g.players[userName].teamName;
                var enemyName = (myTeamName === 'Alpha' ? 'Bravo' : 'Alpha');
                
                var myPlayers = [],
                    enemyPlayers = [];

                Object.keys(g.players).forEach(function(p) {
                    var player = g.players[p];
                    if (player.teamName === myTeamName) {
                        myPlayers.push(player.membershipId);
                    } else {
                        enemyPlayers.push(player.membershipId);
                    }
                });

                var myAvgElo = average(myPlayers.map(function(p) { return players[p].elo ? players[p].elo : 0; })),
                    enemyAvgElo = average(enemyPlayers.map(function(p) { return players[p].elo ? players[p].elo : 0; }))

                var data = [moment(g.date).format("YYYY-MM-DD"), g.map, myAvgElo, enemyAvgElo,
                    (myAvgElo - enemyAvgElo),
                    g.teams[myTeamName].score,
                    g.teams[enemyName].score,
                    (g.teams[myTeamName].result === 'Defeat' ? 'L' : 'W')
                ];
                writer.write(data);

            });

            writer.end();

        } else {
            console.error("Error gettings elos");
        }
    });

}



getPlayerElos();

module.exports = {
    getPlayerElos: getPlayerElos,
    getEloLightChart: getEloLightChart
};