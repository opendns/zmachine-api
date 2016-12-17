var express = require('express');
var AWS = require('aws-sdk');
var env = require('node-env-file');
var spawn = require('child_process').spawn;

var router = express.Router()

var games = [];
var s3;

env(__dirname + '/../.env', {raise: false});

// Need to define AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET env variables
if (process.env.AWS_REGION) {
    AWS.config.region = process.env.AWS_REGION;
    s3 = new AWS.S3({params: {Bucket: process.env.AWS_S3_BUCKET}});
} else {
    console.log('You can not save games until you set the AWS secrets');
}

router.get('/', function(req, res) {
    res.redirect('/games');
});

router.post('/games', function(req, res) {
    var label = req.body.label;
    var game = req.body.game.replace(/[^a-z0-9]/, '');
    var zFile = __dirname + '/../zcode/' + game + '.z5';
    var child = spawn(__dirname + "/../frotz/dfrotz", ["-S 0", zFile]);

    console.log("Game %s spawned for %s: %s", child.pid, label, zFile)
    games[child.pid] = {
        name: game,
        zFile: zFile,
        process: child,
        label: label
    };
    readFromPid(child.pid, function(data) {
        data = new String(data);
        console.log(data);
        data = data.substring(0, data.length - 3);
        response = {
            pid: child.pid,
            data: data
        }
        res.send(response);
    });
});

router.get('/games', function(req, res) {
    output = [];
    games.forEach(function (game) {
        output.push({
            pid: game.process.pid,
            name: game.name,
            zFile: game.zFile,
            label: game.label
        });
    })
    res.send(output);
});

router.delete('/games/:pid', function(req, res) {
    var pid = req.params.pid;
    games[pid].process.kill();
    delete games[pid];
    res.send("Game for " + pid + " terminated.");
});

router.post('/games/:pid/action', function(req, res) {
    var pid = req.params.pid;
    writeToPid(pid, req.body.action);
    readFromPid(pid, function(data) {
        data = new String(data);
        data = data.substring(0, data.length - 3);
        response = {
            pid: pid,
            data: data
        }
        res.send(response);
    });
});

router.post('/games/:pid/save', function(req, res) {
    var pid = req.params.pid;
    var file = req.body.file;
    var filePrefix = games[pid].label + '-' + games[pid].name + '-';
    var path = 'saves/' + filePrefix + file + '.sav';

    var saveToS3 = function(data) {
        // Send our save file to S3 in case the server dies
        data = new String(data);
        data = data.substring(0, data.length - 3);
        console.log("Saving to s3: " + path);
        if (s3 === undefined) {
            res.send('Cannot save to S3: not configured');
            console.log('Cannot save to S3: not configured');
            return;
        }

        var fs = require('fs');
        var body = fs.createReadStream(path);
        var key = 'zmachine/' + path;
        s3.upload({Key: key, Body: body}).
        send(function(err, updata) {
            if (err) {
                console.log("S3 Error: %j", err);
                data = " (not saved to cloud) " + err;
            } else {
                console.log("S3 success: %j", updata);
                data = data + " (saved to cloud)";
            }
            response = {
                pid: pid,
                data: data
            }
            res.send(response);
        });
    };

    console.log('Saving game ' + pid);
    writeToPid(pid, 'save');
    readFromPid(pid, function(data) {
        data = new String(data);
        data = data.substring(0, data.length - 0);
        response = {
            pid: pid,
            data: data
        }

        console.log("Save response: %j", response);
        writeToPid(pid, path);
        readFromPid(pid, function(data) {
            data = new String(data);
            if (data.indexOf('Overwrite') != 1){
                writeToPid(pid, 'y');
                readFromPid(pid, saveToS3)
            }
            else {
                saveToS3(data);
            }
        });
    });
});

router.post('/games/:pid/restore', function(req, res) {
    var pid = req.params.pid;
    var file = req.body.file;
    var filePrefix = games[pid].label + '-' + games[pid].name + '-';
    var path = 'saves/' + filePrefix + file + '.sav';

    // See if game exists on disk
    var restoreFromDisk = function(failure) {
        console.log('Restoring game ' + pid);
        writeToPid(pid, 'restore');
        readFromPid(pid, function(data) {
            data = new String(data);
            data = data.substring(0, data.length - 0);
            response = {
                pid: pid,
                data: data
            }
            console.log("Restore response: %j", response);
            writeToPid(pid, path);
            readFromPid(pid, function(data) {
                data = new String(data);
                if (data.indexOf('Failed') != -1) {
                    data = data.substring(0, data.length - 0);
                    failure(data)
                } else {
                    data = data.substring(0, data.length - 3);
                    response = {
                        pid: pid,
                        data: data
                    }
                    res.send(response);
                }
            });
        });
    };

    var failure = function(data) {
        response = {
            pid: pid,
            data: 'Failed to find save game' + data
        }
        res.send(response)
    };

    var getFromS3 = function() {
        if (s3 === undefined) {
            res.send('Failed to find game on Disk\nCannot get from S3: not configured');
            return;
        }
        // Grab from S3
        console.log('Downloading game ' + pid);
        var params = {Key: 'zmachine/' + path};
        var s3Msg;
        s3.getObject(params, function(err, data) {
            if (err) {
                console.log("S3 Download error: %j", err);
                failure();
            } else {
                console.log("S3 Download success: %s", data.ContentLength);
                var fs = require('fs');
                var fileW = fs.createWriteStream(path);
                fileW.write(data.Body);

                // Now that it's moved from S3 to disk, load the game
                restoreFromDisk(failure);
            }
        });
    };

    restoreFromDisk(getFromS3);
});


module.exports = router;

var writeToPid = function(pid, data) {
    games[pid].process.stdin.write(data + '\n');
};

var readFromPid = function(pid, callback) {
    games[pid].process.stdout.once('data', callback);
};
