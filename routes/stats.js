var express = require('express');
var router = new express.Router();
var db;
var trials = require('../trials');

module.exports = function (database) {
    db = database;
    return router;
};

router.get('/games', function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(db.listPlayers()));
});

router.get('/games/:playerName', function (req, res) {
    var player = req.params.playerName;
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(db.getGames(player)));
});

router.get('/stats', function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    var stats = {};

    // do our stats calculations here.
    //   -

    res.send(JSON.stringify(stats));
});