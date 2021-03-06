// *** Express ***
const express = require('express');
const app = express();

// *** Webpack ***
const env = require('./env/credentials.js');
const webpackDevMiddleware = require('webpack-dev-middleware');
const webpack = require('webpack');
const webpackConfig = require(`./webpack.config${env.prod ? '.prod' : ''}.js`);
const compiler = webpack(webpackConfig);

if (!env.prod) {
  app.use(webpackDevMiddleware(compiler, {
    hot: true,
    filename: 'bundle.js',
    publicPath: '/',
    stats: {
    colors: true,
    },
    historyApiFallback: true,
  }));
}

// *** Static Assets ***
app.use(express.static(__dirname + '/public'));

// *** Database ***
const Db = require('./db/config').mongoose;
const User = require('./db/config').user;
const Song = require('./db/config').song;
const Party = require('./db/config').party;

// *** Parser ***
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
const cookieParser = require('cookie-parser');
app.use(cookieParser());
const querystring = require('querystring');


// *** Helpers ***
const spotifyHelpers = require('./helpers/spotifyHelpers.js');


// *** Server ***
const server = app.listen(process.env.PORT || 3000, () => {
  console.log('Listening at http://localhost:3000');
});

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
  ROUTES to ACCESS SPOTIFY API
* * * * * * * * * * * * * * * * * * * * * * * * * * */


app.get('/hostInfo', (req, res) => {
  spotifyHelpers.getHostInfo(req, res);
});
// fetch song research results and send to client
app.get('/songs/search', (req, res) => {
  spotifyHelpers.getTrackSearchResults(req, res, req.query.query)
});
app.get('/hostPlaylists', (req, res) => {
  spotifyHelpers.getHostPlaylists(req, res);
});

app.get('/currentlyPlaying', (req, res) => {
  spotifyHelpers.currentlyPlaying(req, res);
});

app.get('/playlistSongs', (req, res) => {
  spotifyHelpers.getPlaylistSongs(req, res);
});

// Host Authentication
app.get('/hostLogin', (req, res) => {
  spotifyHelpers.handleHostLogin(req, res);
});

app.get('/callback', (req, res) => {
  spotifyHelpers.redirectAfterLogin(req, res);
});



/* * * * * * * * * * * * * * * * * * * * * * * * * * *
  ROUTES to ACCESS DATABASE SONG COLLECTION
* * * * * * * * * * * * * * * * * * * * * * * * * * */

// fetch top 50 songs by netVoteCount from songs collection and send to client
app.get('/songs', (req, res) => {

  Song.find({partyCode: req.query.partyCode}).sort({netVoteCount: 'descending'}).limit(50)
  .then((songs) => {
    res.send(songs);
  });
});

// add songs to both user collection and songs collection
app.post('/songs', (req, res) => {

  var songsToAdd = req.body.songs;
  var partyCode = req.body.partyCode;
  var userName = req.body.userName;

  if (!Array.isArray(songsToAdd)){
    var song = songsToAdd;
    Song.find({name: song.name, partyCode: partyCode})
    .then((response)=> {
      if (response.length>0) {
        console.log('song already in list');
      } else {
        new Song({
          name: song.name,
          artist: song.artists[0].name,
          image: song.album.images[1].url,
          link: song.external_urls.spotify,
          upVoteCount: 1,
          downVoteCount: 0,
          netVoteCount: 1,
          duration_ms: song.duration_ms,
          userName: userName,
          partyCode: partyCode
        }).save();
      }
      res.sendStatus(201);
    })
  }
  else {

    for (var i = 0 ; i < songsToAdd.length ; i++) {
      var song = songsToAdd[i].track;

      new Song({
        name: song.name,
        artist: song.artists[0].name,
        image: song.album.images[1].url,
        link: song.external_urls.spotify,
        upVoteCount: 1,
        downVoteCount: 0,
        netVoteCount: 1,
        duration_ms: song.duration_ms,
        userName: userName,
        partyCode: partyCode
      }).save();
    }
    res.sendStatus(201);
  }

});

// update vote on songs collection
app.put('/song', (req, res) => {
  Song.findOne({name: req.body.name, partyCode: req.body.partyCode})
  .then(function(song) {
    if (song) {
      if(req.body.vote > 0) {
        song.upVoteCount++;
      } else {
        song.downVoteCount++;
      }
      song.netVoteCount = song.upVoteCount - song.downVoteCount;
      song.save();
      res.sendStatus(201);
    }
  });
});

// delete song from songs collection
app.delete('/song', (req, res) => {
  const songId = req.query.id;
  Song.remove({'_id': songId}, (err) => {
    if (err) { console.log(err); }
  });
  res.sendStatus(201);
});

// delete all songs from one party
app.delete('/songs', (req, res) => {

  Song.remove({partyCode: req.query.partyCode}, (err) => {
    if (err) { console.log(err); }
  });
  res.sendStatus(201);

});

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
  ROUTES to ACCESS DATABASE PARTY COLLECTION
* * * * * * * * * * * * * * * * * * * * * * * * * * */

//Look up party via party code
app.get('/party', (req,res) => {
  Party.findOne({partyCode: req.query.partyCode})
    .then((party) => {
      res.send(party);
    })
});

//Create new party
app.post('/party', (req,res) => {

  //first check if user already has a party create
  //if user already has a party, delete that one & delete songs with that party code

  var newParty = new Party({
    partyCode: req.body.partyCode,
    partyHost: req.body.partyHost,
    token: req.body.token
  });
  Party.findOne({partyCode: req.body.partyCode})
    .then((party) => {
    if(!party) {
      newParty.save()
        .then(() => {
        res.sendStatus(201);
        });
    } else {
      res.send("Party already exists!");
    }
    })
});

app.delete('/party', (req, res)=>{

  Party.remove({partyCode: req.query.partyCode}, (err)=> {
    if (err) {
      console.log(err);
    }
    res.sendStatus(201);
  })
});


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
  ALL Other Routes
* * * * * * * * * * * * * * * * * * * * * * * * * * */

app.get('/tokens', (req, res) => {
  res.send(tokens);
});

// send 404 to client
app.get('/*', (req, res) => {
  res.status(404).send('Not Found');
});