var request = require('request'),
    moment = require('moment'),
    fs = require('fs');

var activities = {
        "TRIALS": 14,
        "IB": 19,
        "CRIMSON": 523,
        "CONTROL": 10,
        "CLASH": 12,
        "RIFT": 24,
        "RUMBLE": 13,
        "ELIMINATION": 23,
        "SKIRMISH": 9,
        "SALVAGE": 11,
        "DOUBLES": 15,
        "ZONE_CONTROL": 28
    };

module.exports = {
    activities: activities,
    buildPostgameURL: function(activityId) {
        return "http://proxy.guardian.gg/Platform/Destiny/Stats/PostGameCarnageReport/" + activityId + "/?definitions=false&lc=en";
    },
    buildEloUrl: function(startDate, endDate, membershipIds) {
        return "http://api.guardian.gg/elo/history/" + membershipIds.join(',')
            + "?start=" + startDate + "&end=" + endDate + "&mode=14";
    },
    average: function(arr) {
        return Math.ceil(arr.reduce(function (a, b) {
            return a + b
        }) / arr.length);
    },
    lookupPlayer: function(userName, charIndex, callback) {
    // get the membership id and character id
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
                        var characterId = body.Response.data.characters[charIndex].characterBase.characterId;
                        callback(membershipId, characterId);
                    } else {
                        console.error(error);
                    }
                })

            } else {
                console.error(error);
            }
        });
    },
    getSummary: function(membershipId, characterId, mode, count, callback) {
        var summaryUrl = "http://proxy.guardian.gg/Platform/Destiny/Stats/ActivityHistory/1/"
            + membershipId + "/" + characterId + "/?mode=" + activities[mode] + "&definitions=true&count=" + count + "&page=0&lc=en";
        // console.log("Summary URL: ", summaryUrl);
        // get match summaries
        request({
            url: summaryUrl,
            json: true
        }, function (error, response, body) {

            if (!error && response.statusCode === 200) {
                var matches = body.Response.data.activities.map(function (activity) {
                    return {
                        mapName: body.Response.definitions.activities[activity.activityDetails.referenceId].activityName,
                        instanceId: activity.activityDetails.instanceId,
                        date: moment(activity.period)
                    }
                });
                callback(matches);
            } else {
                console.error("Error looking up Trials match summary");
            }
        });
    },
    saveDetails: function(games, mode) {
        var gamesStr = JSON.stringify(games, null, 2);
        if (!fs.existsSync("./out")) {
            fs.mkdirSync("./out");
        }

        fs.writeFile("./out/" + userName + "-" + mode + "-games.json", gamesStr, function (err) {
            if (err) throw err;
        });
    }
}
