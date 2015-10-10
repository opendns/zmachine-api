var express = require('express');
var bodyParser = require('body-parser');
var AWS = require('aws-sdk');
var env = require('node-env-file');
var spawn = require('child_process').spawn;

var app = express();

var games = [];
var s3;

env(__dirname + '/../.env', {raise: false});

var port = process.env.PORT;

// Need to define AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET env variables
if (process.env.AWS_REGION) {
    AWS.config.region = process.env.AWS_REGION;
    s3 = new AWS.S3({params: {Bucket: process.env.AWS_S3_BUCKET}});
} else {
    console.log('You can not save games until you set the AWS secrets');
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
    console.log("Game %s spawned for %s: %s", child.pid, label, zFile)
    games[child.pid] = {
        name: game,
        zFile: zFile,
        process: child,
        label: label
    };
    games[child.pid].process.stdout.once('data', function(data) {
        data = new String(data);
        data = data.substring(0, data.length - 3);
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
    games[pid].process.kill();
    delete games[pid];
    res.send("Game for " + pid + " terminated.");
});

app.post('/games/:pid/action', function(req, res) {
    var pid = req.params.pid;
    games[pid].process.stdin.write(req.body.action + "\n");
    games[pid].process.stdout.once('data', function(data) {
        data = new String(data);
        data = data.substring(0, data.length - 3);
        response = {
            pid: pid,
            data: data
        }
        res.send(response);
    });
});

app.post('/games/:pid/save', function(req, res) {
    if (s3 === undefined) {
        res.send('not configured');
        return;
    }
    var pid = req.params.pid;
    var file = req.body.file;
    var filePrefix = games[pid].label + '-' + games[pid].name + '-';
    var path = 'saves/' + filePrefix + file + '.sav';
    console.log('Saving game ' + pid);
    games[pid].process.stdin.write('save\n');
    games[pid].process.stdout.once('data', function(data) {
        data = new String(data);
        data = data.substring(0, data.length - 0);
        response = {
            pid: pid,
            data: data
        }
        console.log("Save response: %j", response);
        games[pid].process.stdin.write(path + '\n');
        games[pid].process.stdout.once('data', function(data) {
            data = new String(data);
            data = data.substring(0, data.length - 3);

            // Send our save file to S3 in case the server dies
            console.log("Saving to s3: " + path);

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
        });
    });
});

app.post('/games/:pid/restore', function(req, res) {
    if (s3 === undefined) {
        res.send('not configured');
        return;
    }
    var pid = req.params.pid;
    var file = req.body.file;
    var filePrefix = games[pid].label + '-' + games[pid].name + '-';
    var path = 'saves/' + filePrefix + file + '.sav';

    // Grab from S3
    console.log('Downloading game ' + pid);
    var params = {Key: 'zmachine/' + path};
    var s3Msg;
    s3.getObject(params, function(err, data) {
        if (err) {
            console.log("S3 Download error: %j", err);
        } else {
            console.log("S3 Download success: %s", data.ContentLength);
            var fs = require('fs');
            var fileW = fs.createWriteStream(path);
            fileW.write(data.Body);

            // Now that it's moved from S3 to disk, load the game
            console.log('Restoring game ' + pid);
            games[pid].process.stdin.write('restore\n');
            games[pid].process.stdout.once('data', function(data) {
                data = new String(data);
                data = data.substring(0, data.length - 0);
                response = {
                    pid: pid,
                    data: data
                }
                console.log("Restore response: %j", response)
                games[pid].process.stdin.write(path + '\n');
                games[pid].process.stdout.once('data', function(data) {
                    data = new String(data);
                    data = data.substring(0, data.length - 3);
                    response = {
                        pid: pid,
                        data: data
                    }
                    res.send(response);
                });
            });
        }
    });
});

var server = app.listen(port, function() {
    var host = server.address().address;
    var port = server.address().port;

    console.log('All listening on %s:%s', host, port);
});
