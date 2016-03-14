const MEMBERSHIP_ID;

var fs = require('fs'),
    colors = require('colors');
var games = JSON.parse(fs.readFileSync('games.json', 'utf8'));

games.forEach(function(g) {
    var myTeam = g.players[MEMBERSHIP_ID].teamName;
    var enemy = (myTeam === 'Alpha' ? 'Bravo' : 'Alpha');


    console.log(colors.blue(g.teams[myTeam].lightLevel), 
        colors.red(g.teams[enemy].lightLevel), 
        g.teams[myTeam].result === 'Defeat' ? colors.red.bold('L') : colors.green.bold('W'));	
});
