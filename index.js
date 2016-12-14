var
  argv        = require('yargs')                              //better terminal arguments handling
      .demand('credentials')                                  //require --credentials on the command line
      .argv,
  bodyParser  = require('body-parser'),                       //process JSON passed in body of HTTP request
  express     = require('express'),                           //web server
  _           = require('lodash'),                            //chain-able data manipulation
  redis       = require('redis'),                             //lets us make Redis requests
  redisCred   = require(argv.credentials),                    //we take the result of "--credentials" and open/require it - should be a node_redis connection object
  redisnn     = require('redis-nn'),                          //enable the neural network commands of the neural Redis module

  app         = express(),                                    //the instance of our web server
  client;

redisnn(redis);                                               //adds all the neural redis commands to our redis library
client = redis.createClient(redisCred);                       //create the instance of your Redis client

function genericReply(res, next) {                            //we pass the `res`(ponse) and the `next` as arguments - it'll be used inside our Express routes
  return function(err,results) {                              //handle most of the replies the same way, so use a closure
    if (err) { next(err); } else {                            //if the Redis request is an error, it will pass it back to Express to render the error over HTTP
      res.send(String(results));                              //We are string-ifying the response because Express can interpret a numerical response as a status code
    }
  };
}

app.get('/info/:key',function(req,res,next) {                 //:key can be anything - if you were doing something in production you'd likely want to control this a bit more
  client.nr_info(req.params.key,function(err,infoArr) {       //NR.INFO will fetch the info about the neural network
    if (err) { next(err); } else {                            //if the Redis request is an error, it will pass it back to Express to render the error over HTTP
      res.send(
        _(infoArr)                                            //lodash-ify the passed var
          .chunk(2)                                           //converts array like ['a',2,'b',4] into [['a',2],['b',4]]
          .map(function(aChunk) {
            return { property : aChunk[0], value : aChunk[1] };
          })
          .value()                                            //we're done with lodash, return the final results
      );
    }
  });
});

app.put('/network',                                           //no arguments - just a PUT request to /network
  bodyParser.json(),                                          //Angular's `$http`, out of the box, sends the body in JSON encoding
  function(req,res,next) {
    var
      createArgs = [                                          //this is the start of the arguments to be passed into the NR.CREATE command
        req.body.networkType, 
        req.body.numberOfInputs 
      ];                                                      //Since the command's number of arguments can be quite a range, this is the best way to handle the variance
      
    if (req.body.hiddenLayers) {                              //Hidden layers are optional, so if anything is passed in, it will add it here
      createArgs.push(req.body.hiddenLayers);
    }

    createArgs.push('->', req.body.outputs);                  //We push in both the arrow and the outputs

    if (req.body.dataset) {                                   //Dataset is also optional
      createArgs.push('DATASET', req.body.dataset);           //If `dataset` exists in the request then we add in 'DATASET' followed by the number
    }
    if (req.body.testset) {                                   //Testset too is optional
      createArgs.push('TEST', req.body.testset);              //If `testset` exists in the request then we add in 'TEST' and the number
    }
    if (req.body.normalize === true) {                        //Normalization is optional, although you'll use it most of the time
      createArgs.push('NORMALIZE');                           //If `normalize` exists in the request then we add in 'NORMALIZE'
    }

    client.nr_create(req.body.key, createArgs, function(err,results) {
      if (err) { next(err); } else {                          //if the Redis request is an error, it will pass it back to Express to render the error over HTTP
        res.send({                                            //Send an object because we want to extract the data for the toaster notification
          tunableParameters : results
        });
      }
    });
  }
);

app.put('/network/:key',                                    //:key can be anything - if you were doing something in production you'd likely want to control this a bit more
  bodyParser.json(),                                        //Angular's `$http`, out of the box, sends the body in JSON encoding
  function(req,res,next) {
    var
      observeMulti  = client.multi();                       //Start a MULTI so we can handle multiple NR.OBSERVE's at once

    req.body.forEach(function(aRow) {                       //The body is an array, so we `forEach` it
      var
        observeArgs = [].concat(                            //This might be a bit ungraceful, but since `aRow.input` and `aRow.output` are both arrays we can't just push or declare them in a `[]` block
          aRow.input,
          '->',                                             //If you concat a string, it just comes in as if it were inside an Array.
          aRow.output);

      if (aRow.dataset) {                                   //`aRow.dataset` can either be 'TRAIN' or 'TEST' or not present
        observeArgs.push(aRow.dataset);                     //If it is present, then push it into the array of arguments
      }
      observeMulti.nr_observe(req.params.key, observeArgs); //when done, we push the NR.OBSERVE into a MULTI
    });

    observeMulti.exec(function(err,results) {               //After adding all the rows to the MULTI, EXECute it
      var
        successfulRows,
        errorRows;

      if (err) { next(err); } else {                        //if the Redis request is an error, it will pass it back to Express to render the error over HTTP
        successfulRows = results.filter(function(aResult) { //Currently, the Modules API can report errors in an unexpected way, an array of responses or errors
          return !(aResult instanceof Error);               //If it's not an error then we keep it for `successfulRows`
        });
        errorRows = results.filter(function(aResult) {
          return aResult instanceof Error;                  //If it's an error then we add it to `errorRows`
        });

        res.send({                                          //send an object with the successful and error rows
          successfulRows  : successfulRows,
          errorRows       : errorRows
        });
      }
    });
  }
);

app.patch('/network/:key',                                  //:key can be anything - if you were doing something in production you'd likely want to control this a bit more
  bodyParser.json(),                                        //Angular's `$http`, out of the box, sends the body in JSON encoding
  function(req,res,next) {
    var
      trainArgs  = [];                                      //nearly everything is optional here

    if (req.body.maxCycles) {                               //If `maxCycles` is in the request
      trainArgs.push('MAXCYCLES', req.body.maxCycles);      //then push 'MAXCYCLES' and the number of cycles into the arguments
    }
    if (req.body.maxTime) {                                 //If `maxTime` is in the request
      trainArgs.push('MAXTIME', req.body.maxTime);          //then push 'MAXTIME' and the number of milliseconds into the arguments
    }
    if (req.body.autostop) {                                //If `autostop` is in the request
      trainArgs.push('AUTOSTOP');                           //then push 'AUTOSTOP' into the arguments
    }
    if (req.body.backtrack) {                               //If 'backtrack' is in the request
      trainArgs.push('BACKTRACK');                          //then push 'BACKTRACK' into the arguments
    }

    client.nr_train(                                        //Run NR.TRAIN
      req.params.key,                                       //With the passed in key
      trainArgs,                                            //And the training arguments from above - it may be an empty Array
      genericReply(res,next)                                //Use our `genericReply` with the `res` and the `next` - we'll have a very simple response - either an error or the direct dump of the Redis response
    );
  }
);

app.get('/network/:key/*',                                  //We're taking advantage of Express' wildcard routes. Any GET request that starts with `/network/` any key and a `/` - after that we'll process with a RegExp
  function(req,res,next) {
    var 
      runParams = req.params[0].split('/');                 //Very naïve, but we're just splitting by '/' all the arguments should be numbers. It's quick and dirty, but for production I'd be more rigorous with the pattern matching 

    if (req.query.classify) {                               //If their is a '?query=' with a truthy value, then we run a NR.CLASS
      client.nr_class(req.params.key, runParams, genericReply(res,next));
    } else {                                                //Otherwise, we run a NR.RUN
      client.nr_run(req.params.key, runParams, genericReply(res,next));
    }
  }
);

app.delete('/network/:key',                                 //:key can be anything - if you were doing something in production you'd likely want to control this a bit more
  function(req,res,next) {
    client.nr_reset(req.params.key,genericReply(res,next));
  }
);

app.use(express.static('static'));                          //Serve all the flat files in the 'static' directory
app.listen(8781, function() {                               //Stand up the server at port 8781
  console.log('Server running.');                           //Log that we're up and running
});