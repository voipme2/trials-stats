var process = require('process');

var userName = process.argv[2];

var fs = require('fs'),
    colors = require('colors'),
    csv = require('csv-write-stream');

var games = JSON.parse(fs.readFileSync('./out/' + userName + '-games.json', 'utf8'));

var writer = csv({ headers: ["Map", "Our Elo", "Enemy Elo", "Elo Diff",
    "Our Light", "Enemy Light", "Light Diff", "Our Score", "Enemey Score", "Result"]});
writer.pipe(fs.createWriteStream("./out/" + userName + "-elolight.csv"))

games.forEach(function(g) {
    var myTeamName = g.players[userName].teamName;
    var enemyName = (myTeamName === 'Alpha' ? 'Bravo' : 'Alpha');
    var myTeam = g.teams[myTeamName],
        enemyTeam = g.teams[enemyName];

    var data = [g.map, myTeam.averageElo, enemyTeam.averageElo,
        (myTeam.averageElo - enemyTeam.averageElo),
        myTeam.averageLightLevel, enemyTeam.averageLightLevel,
        (myTeam.averageLightLevel - enemyTeam.averageLightLevel),
        myTeam.score,
        enemyTeam.score,
        myTeam.result === 'Defeat' ? 'L' : 'W'];
    writer.write(data);
});
writer.end();
