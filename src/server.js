var express = require('express');
var bodyParser = require('body-parser');
var env = require('node-env-file');
var spawn = require('child_process').spawn;

var app = express();

var games = [];
var s3;

env(__dirname + '/../.env', {raise: false});

var port = process.env.PORT;

// Need to define AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET env variables
if (process.env.AWS_REGION) {
    var AWS = require('aws-sdk');
    AWS.config.region = process.env.AWS_REGION;
    s3 = new AWS.S3({params: {Bucket: process.env.AWS_S3_BUCKET}});
    console.log('Games will be saved to S3.');
} else {
    console.log('Games will be saved to disk only.');
}

app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({ // to support URL-encoded bodies
    extended: true
}));

app.get('/', function(req, res) {
    res.redirect('/games');
});

app.post('/games', function(req, res) {
    var label = req.body.label;
    var game = req.body.game.replace(/[^a-z0-9]/, '');
    var zFile = __dirname + '/../zcode/' + game + '.z5';
    var child = spawn(__dirname + "/../frotz/dfrotz", ["-S 0", zFile]);
    child.on('error', function(err) {
      console.log('Error spawning game: ' + err);
      res.status(500).send({error: 'Could not create the game.'});
      return;
    });

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
        // zmachine responds with "\n>" at the end of each command.
        // so strip off those 2 extra chars
        data = data.substring(0, data.length - 2);
        response = {
            pid: child.pid,
            data: data
        }
        res.send(response);
    });
});

app.get('/games', function(req, res) {
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

app.delete('/games/:pid', function(req, res) {
    var pid = req.params.pid;
    if (undefined === games[pid]) {
      res.status(404).send({error: 'Game ' + pid + ' not found.'});
    } else {
      games[pid].process.kill();
      delete games[pid];
      res.send("Game for " + pid + " terminated.");
    }
});

app.post('/games/:pid/action', function(req, res) {
    var pid = req.params.pid;
    if (undefined === games[pid]) {
      res.status(404).send({error: 'Game ' + pid + ' not found.'});
      return
    }
    writeToPid(pid, req.body.action);
    readFromPid(pid, function(data) {
        data = new String(data);
        // zmachine responds with "\n>" at the end of each command.
        // so strip off those 2 extra chars
        data = data.substring(0, data.length - 2);
        response = {
            pid: pid,
            data: data
        }
        res.send(response);
    });
});

app.post('/games/:pid/save', function(req, res) {
    var pid = req.params.pid;
    if (undefined === games[pid]) {
      res.status(404).send({error: 'Game ' + pid + ' not found.'});
      return
    }
    if (undefined === req.body.file) {
      res.status(400).send({error: 'File not specified.'});
      return
    }
    var file = req.body.file;
    var filePrefix = games[pid].label + '-' + games[pid].name + '-';
    var path = 'saves/' + filePrefix + file + '.sav';

    var saveToS3 = function(data) {
        if (s3 === undefined) {
            // Skip the S3 save if S3 isn't configured
            return;
        }
        // Send our save file to S3 in case the server dies
        data = new String(data);
        data = data.substring(0, data.length - 3);
        console.log("Pushing saved game to s3: " + path);

        var fs = require('fs');
        var body = fs.createReadStream(path);
        var key = 'zmachine/' + path;
        s3.upload({Key: key, Body: body}).
        send(function(err, updata) {
            if (err) {
                console.log("S3 Error: %j", err);
                data = " (not saved to cloud) " + err;
                res.status(503);
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

    console.log('Saving game ' + pid + ' to ' + path);
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
                if (s3 !== undefined) {
                  saveToS3(data);
                }
            }
        });
        res.send(response);
    });
});

app.post('/games/:pid/restore', function(req, res) {
    var pid = req.params.pid;
    if (undefined === games[pid]) {
      res.status(404).send({error: 'Game ' + pid + ' not found.'});
      return
    }
    if (undefined === req.body.file) {
      res.status(400).send({error: 'File not specified.'});
      return
    }
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
                    data = data.substring(0, data.length - 2);
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
        res.status(404).send(response)
    };

    var getFromS3 = function() {
        if (s3 === undefined) {
            res.status(404).send('Failed to find game on Disk\nCannot get from S3: not configured');
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

    if (s3 === undefined) {
        restoreFromDisk(failure);
    } else {
        restoreFromDisk(getFromS3);
    }
});

var server = app.listen(port, function() {
    var host = server.address().address;
    var port = server.address().port;

    console.log('All listening on %s:%s', host, port);
}).on('error', function(err){
    console.log('on error handler');
    console.log(err);
});

process.on('uncaughtException', function(err) {
    console.log('process.on handler');
    console.log(err);
});

var writeToPid = function(pid, data) {
    games[pid].process.stdin.write(data + '\n');
};

var readFromPid = function(pid, callback) {
    games[pid].process.stdout.once('data', callback);
};
