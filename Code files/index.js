//server initialisation
const express = require('express') // Include ExpressJS
const app = express() // Create an ExpressJS app
//const bodyParser = require('body-parser'); // Middleware
app.use(express.urlencoded({ extended: true }));
//const http = require("http");
app.use(express.static(__dirname + '/public'));
const path = require('path');

//ejs initialisation
const ejs = require("ejs");
app.set("view engine", "ejs");

//socket.io initialisation
const { createServer } = require('http');
const { Server } = require('socket.io');
const SocketIoExpressSession = require("socket.io-express-session");
const server = createServer(app);
const io = new Server(server);

//session storage initialisation
const session = require('express-session');
// Define the session middleware
const sessionMiddleware = session({
  secret: 'qwertyuioplkjhgfdsazxcvbnm',
  resave: false,
  saveUninitialized: true,
});

app.use(sessionMiddleware);

// Use the session middleware with socket.io
io.use(SocketIoExpressSession(sessionMiddleware));

app.use((req, res, next) => {
  if (req.session) {
    if (!req.session.initialized) {
      req.session.remember = false;
      req.session.initialized = true; // Mark session as initialized
    }
  } else {
  }
  next();
});
//     ↓ MONGODB INITIALISATION ↓     //

app.use(express.json());
const { MongoClient } = require("mongodb");
const bcrypt = require('bcrypt'); //password encryption
// Replace the following with your Atlas connection string                      

const url = "mongodb+srv://HelloWorld12545:Club6571@login.bzxd9ch.mongodb.net/?retryWrites=true&w=majority"

const client = new MongoClient(url);
// Reference the database to use
const dbName = "login";
async function init() {
  await client.connect();
}
init();
const db = client.db(dbName);
//END INITIALISATION


io.on('connection', (socket) => {
  const { session } = socket.handshake; //access session data
  
  if (session.user) { //join public room automatically
    socket.join('{');
    session.user.room = '{';
  }

  /*socket.on('disconnect', () => {
    console.log('user disconnected');
  });*/

  socket.on('chat message', async (msg) => {
    //io.emit('chat message', msg);
    msg = (session.user.username + ": " + msg); //Add username to message
    io.to(session.user.room).emit('chat message', msg); //send message to current room
    if (session.user.room == '{') { //if public chat

    } else {
      //add message to both users' message arrays
      await db.collection('users').updateOne( 
        { username: session.user.username },
        {
          $push: {
            [`friends.${session.user.friendUsername}.messages`]: msg
          }
        }
      );

      await db.collection('users').updateOne(
        { username: session.user.friendUsername },
        {
          $push: {
            [`friends.${session.user.username}.messages`]: msg
          }
        }
      );
    }
  });

  socket.on('change room', async (newRoom) => {
    session.user.friendUsername = newRoom;

    if (session.user && session.user.room) { //leave the current room if there is any
      socket.leave(session.user.room);
    }
    if (newRoom === '{') { //public room
      socket.join('{');
      session.user.room = '{';
    } else {
      if (session.user && session.user.friends) {
        //obtain messages to display on frontend
        var messages = await db.collection('users').findOne({ username: session.user.username }); 
        messages = messages.friends[newRoom].messages; 
        
        newRoom = session.user.friends[newRoom].room;
        socket.join(newRoom);
        session.user.room = newRoom;
      }
    }
    socket.emit('change room', messages);
  });

  socket.on('add friend', async (friendUsername) => {
    try {

      const youRequested = await db.collection('users').findOne(
        { username: friendUsername, friendRequests: session.user.username }
      );
      const theyRequested = await db.collection('users').findOne(
        { username: session.user.username, friendRequests: friendUsername }
      );
      const friended = await db.collection('users').findOne(
        {
          username: session.user.username,
          [`friends.${friendUsername}`]: { $exists: true }
        }
      );
      if (youRequested) {
        socket.emit('add friend', 3);
      } else if (theyRequested) {
        socket.emit('add friend', 5);
      } else if (friended) {
        socket.emit('add friend', 4);
      } else if (friendUsername === session.user.username) {
        socket.emit('add friend', 6);
      } else {
        //v find friend in database v
        const result = await db.collection('users').updateOne(
          { username: friendUsername },
          { $push: { friendRequests: session.user.username } }//add friend request to friend's database document
        );

        if (result.modifiedCount === 0) { //friend doesn't exist
          socket.emit('add friend', 2);
        } else { //friend request successful - all checks passed
          socket.emit('add friend', 1); 
        }
      }
    } catch (error) {
      console.error('An error occurred:', error);
    }
  });

  socket.on('handle friend request', async (friendUsername, accept) => {
    if (accept) {
      const roomName = session.user.username + friendUsername; //room name concatenation

      await db.collection('users').updateOne(
        { username: session.user.username },
        {
          $set: {
            [`friends.${friendUsername}`]: {
              room: roomName,  // or whatever room number you have
              messages: []
            }
          }
        }
      );

      await db.collection('users').updateOne(
        { username: friendUsername },
        {
          $set: {
            [`friends.${session.user.username}`]: {
              room: roomName, 
              messages: []
            }
          }
        }
      );
    }
    await db.collection('users').updateOne( //finally remove friend request
      { username: session.user.username },
      { $pull: { friendRequests: friendUsername } }
    );
  });

  socket.on('friend image', async (friendArray) => {
    var images = [];
    for (let i = 0; i < friendArray.length; i++) {
      const user = await db.collection('users').findOne({username: friendArray[i]});
      if (user && user.profilePic) {
        images.push(user.profilePic);
      } else {
  images.push("https://static.vecteezy.com/system/resources/previews/008/442/086/non_2x/illustration-of-human-icon-user-symbol-icon-modern-design-on-blank-background-free-vector.jpg")
      }
    }
    socket.emit('friend image', images);
  });
});



app.post('/login', async (req, res) => {
  // req.body object has your form values
  //console.log(req.body.uname);
  //console.log(req.body.psw);
  const { username: username, password: password } = req.body;

  try {
    const user = await db.collection('users').findOne({ username });
    if (!user || !await bcrypt.compare(password, user.hashedPassword)) {
      console.log('Invalid username or password');
      return;
    }

    //LOGIN SUCCESSFUL

    req.session.user = user; //save the mongodb document as an object for the current user only

    if (req.body.remember) {
      req.session.remember = true;
    } else {
      req.session.remember = false;
      console.log("Don't remember me");
    }
    try {
      res.render("loggedin", { user: req.session.user, alert: 0 });
    } catch (err) {
      console.error("Error rendering the logged-in view:", err);
      res.status(500).send("Internal server error");
    }
  } catch (error) {
    console.error(error);
    //res.status(500).send('Internal server ereror');
  }
});

app.post('/signup', async (req, res) => {
  // req.body object has your form values
  const { newUsername: username, newPassword: password, passwordRepeat: passwordRepeat, secret: secretText } = req.body;
  try {
    if (password != passwordRepeat) {
      console.log("Passwords don't match");
      return;
    }
    const existingUser = await db.collection('users').findOne({ username });
    if (existingUser) {
      console.log('Username already exists');
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 5);

    await db.collection('users').insertOne({
      username,
      hashedPassword,
      secretText
    });

    console.log('User registered successfully!');
    const user = await db.collection('users').findOne({ username });
    req.session.user = user; //save the mongodb document as an object for the current user only

    if (req.body.signUpRemember) {
      req.session.remember = true;
    } else {
      req.session.remember = false;
    }
    //username: ("You have successfully registered, ").concat(username)
    res.render("loggedin", { user: user, alert: 0 });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

app.post('/editProfile', async (req, res) => {

  var alert = 1;
  const { newUsername, newSecret, newImage } = req.body;

  try {
    const user = await db.collection('users').findOne({ username: req.session.user.username });
    const existingUser = await db.collection('users').findOne({
      username: newUsername,
      _id: { $ne: user._id }
    });

    if (existingUser) {
      alert = 2;
    } else {

      await db.collection('users').updateOne(
        { username: req.session.user.username },
        { $set: { username: newUsername, secretText: newSecret, profilePic: newImage } },
      );

      req.session.user = await db.collection('users').findOne({ newUsername }); //save values for updated profile
    }

    //finally redirect to loggedin webpage
    res.render("loggedin", { user: req.session.user, alert: alert });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).send('Internal server error');
  }
});

app.post('/signout', async (req, res) => {
  req.session.remember = false;
  delete req.session.user;
  res.render("index", { rememberMe: req.session.remember });
});

app.post('/delete', async (req, res) => {
  req.session.remember = false;
  await db.collection('users').deleteOne( { username: req.session.user.username } )
  delete req.session.user;
  res.render("index", { rememberMe: req.session.remember });
});




//      ↓ EJS PAGES ↓      //

app.get('/loggedin', (req, res) => { //Redirect here if remember me checkbox is ticked
  res.render("loggedin", { user: req.session.user, alert: 0 });
});

app.get('/', (req, res) => {
  res.render("index", { rememberMe: req.session.remember });
});

app.get('/Test', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/Test.html'));
});

app.get('/about', (req, res) => {
  res.render("about");
});

app.get('/charts', (req, res) => {
  res.render("charts");
});

app.get('/bskbrr', (req, res) => {
  res.render("Games/bskbrr");
});

app.get('/1', (req, res) => {
  res.render("Games/btd");
});

app.get('/Hub', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/TheHub.html'));
});

app.get('/Sci-Calculator', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/Sci-Calculator.html'));
});

app.get('/old', (req, res) => {
  res.render('oldhomepage');
});

/**/


/*app.get('/socketio', (req,res) => {
  res.sendFile(join(__dirname, 'socketio.html')); //res.sendfile is only to show HTML pages, not ejs
});*/


//use server.listen for socket io NOT app.listen
// Function to listen on the port (START SERVER)
server.listen(3000, () => console.log(`Server started!`));

//<img src="<%= url %>" alt="alternatetext"> 
//if I put this in ejs file it creates an error
