var express = require('express');
var bodyParser = require('body-parser');
var env = require('node-env-file');
var spawn = require('child_process').spawn;

var app = express();

env(__dirname + '/../.env', {raise: false});

var port = process.env.PORT;


app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({ // to support URL-encoded bodies
    extended: true
}));

app.use('/', require('./app'));


var server = app.listen(port, function() {
    var host = server.address().address;
    var port = server.address().port;

    console.log('All listening on %s:%s', host, port);
});

var writeToPid = function(pid, data) {
    games[pid].process.stdin.write(data + '\n');
};

var readFromPid = function(pid, callback) {
    games[pid].process.stdout.once('data', callback);
};
