
var fs = require('fs');

// load in our data
var data = {};
fs.readdirSync("./data/").forEach(function(file) {
    if (file.indexOf(".games.json") !== -1) {
        var pName = file.substr(0, file.indexOf('.'));
        data[pName] = require("./" + file);
    }
});

function listPlayers() {
    return Object.keys(data);
}

function getGames(player) {
    return data[player] || [];
}

module.exports = {
    listPlayers: listPlayers,
    getGames: getGames
};