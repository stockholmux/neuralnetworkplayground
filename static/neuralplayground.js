angular
  .module(
    'neuralPlayground',                                                       //our module's name
    [
      'ngTable',                                                              //Using ngTable to render a nice, sortable table
      'toaster'                                                               //Growl-like notifications
    ]
  )
  .controller('PlaygroundCtrl', function(                                     //Our one-and-only controller
    $scope,                                                                   //used to pass data to/from the template
    $http,                                                                    //HTTP/"ajax" object
    NgTableParams,                                                            //How to get data into ngTable
    toaster) {                                                                //Where we can trigger growl-like notifications
    var
      setDefaultCreateParams,
      genericError;
    
    genericError = function (title) {                                         //Our errors are mostly all handled by the same closure
      return function(response) {                                             //Get the response from the server
        toaster.pop({                                                         //a notification
          type  : 'error',                                                    //that is red
          title : title,                                                      //`title` is passed from the outer function
          body  : response.data                                               //Just the response body from the HTTP request
        });
      };
    };
    
    setDefaultCreateParams = function() {                                     //This is our default parameters for the NR.CREATE
      $scope.createParams = {
        networkType : 'REGRESSOR'                                             //you could specify more defaults here
      };                                                                      //We've abstracted this out into a separate function because we call it a couple of different times - DRY
    };

    $scope.addObserveRow = function() {                                       //Add a row to the observe table
      $scope.observeRows.push({ input : [], output : []});                    //It starts out with no values for input or output
    };
    $scope.getInfo = function() {                                             //For our app, this turns out to be a very important function. We're basically calling NR.INFO but it informs the rest of the app on how many inputs, outputs and the type of neural network we're dealing with
      var
        successfulInfo,
        failedInfo,
        i;

      successfulInfo = function(response) {                                   //Called when the HTTP request is successful
        response.data.forEach(function(aRow) {                                //The format that we're getting won't work directly for the ngTable and to populate a few important variables throughout the playground
          $scope.classify = false;                                            //Set some defaults in `$scope` that we may override later
          $scope.observeRows = [];
          $scope.responses = [];
          $scope.runParams = {};

          $scope.addObserveRow();                                             //Give ourself a row initially for NR.OBSERVE

          if (aRow.property === 'auto-normalization') {                       //This dictates how we are going to lock-down the output for NR.OBSERVE. If it is not auto-normalized then the value must be -/+ 1
            $scope.autoNormalize = Number(aRow.value);                        //It will be either "0" or "1"
          }
          if (aRow.property === 'type') {                                     //Is it a classifier or regressor?
            $scope.netType = aRow.value;
          }
          if (aRow.property === 'layout') {                                   //This reveals the number ofinputs, outputs and hidden layers. Hidden layers is pretty much trivia, but the array will be arranged [inputs, outputs] if you don't have any hidden layers and [inputs, hiddenLayers, outputs] if you do
            $scope.inputs = aRow.value[0];
            if (aRow.value.length === 2) {
              $scope.outputs = aRow.value[1];
              $scope.hiddenLayers = undefined;
            } else {
              $scope.hiddenLayers = aRow.value[1];
              $scope.outputs = aRow.value[2];
            }

            $scope.inputsArr = [];
            for (i = 0; i < $scope.inputs; i += 1) {                          //To use Angular's ng-repeat we're generating an [1,2,3...n] array
              $scope.inputsArr.push(i);
            } 
          }
        });
        
        if ($scope.netType === 'regressor') {                                 //Regressor can have multiple outputs
          $scope.outputsArr = [];
          for (i = 0; i < $scope.outputs; i += 1) {                           //To use Angular's ng-repeat we're generating an [1,2,3...n] array
            $scope.outputsArr.push(i);
          }
        } else {
          $scope.outputsArr = [0];                                            //While a classifier has only one output
        }

        response.data.unshift(                                                //Add the "key" to the info box - this is primarily just visual
          { property : 'key', value : $scope.neuralKey }
        );
        $scope.networkInfo = response.data;                                   //primarily used just to indicate that we have got our data

        $scope.infoTable = new NgTableParams({                                //throw the table data and parameters over the fence to the template and ngTable
            count   : 50                                                      //This just prevents pagination
          }, { 
            dataset : response.data                                           //Our data
          }
        );
      };
      failedInfo = function() {                                               //A failure, which can be either something wrong with the NR.INFO command or simply a yet-to-be-created neural network
        $scope.networkInfo = false;                                         
      };

      $http
        .get('/info/'+$scope.neuralKey)                                       //Do an HTTP GET to /info/your-key
        .then(successfulInfo,failedInfo);                                     //Handle both success and failure
    };
    $scope.create = function() {
      var
        successfulCreation,
        failedCreation;

      successfulCreation = function(response) {                               //Handle the successful creation of a neural network
        toaster.pop({                                                         //Trigger a growl-like notification
          type: 'success',
          title: 'Created Neural Network',
          body: response.data.tunableParameters+' Tunable Parameters'
        });
        setDefaultCreateParams();                                             //Reset the NR.CREATE form
        $scope.getInfo();                                                     //Get the info of the newly created neural network
      };
      failedCreation = function(response) {                                   //Handle the failure to create a neural network
        toaster.pop({                                                         //Trigger a growl-like error notification
          type: 'error',
          title: 'Creating Neural Network Failed',
          body: response.data                                                 //This will give back the entire Error dump. Production would give a nicer, more effective error message
        });
      };

      $scope.createParams.key = $scope.neuralKey;                             //set the createParams key (which is not on the form) to the current neuralKey

      $http
        .put('/network',$scope.createParams)                                  //Do an HTTP PUT to /network with a JSON body ($scope.createParams)
        .then(successfulCreation,failedCreation);                             //Handle both success and failure

    };
    $scope.observe = function(key,rows) {                                     //We're passing values here rather than using $scope - for future work :)
      var
        successfulObservation,
        failedObservation;
      
      successfulObservation = function(successes) {                           //Handle the successful observations
        toaster.pop({                                                         //Trigger a growl-like notification
          type  : 'success',
          title : 'Observed '+successes.length+' Row(s)'
        });
        $scope.observeRows = [];                                              //reset the rows array
        $scope.addObserveRow();                                               //Add an initial row for the user
      };
      failedObservation = function(errors) {
        toaster.pop({                                                         //Trigger a growl-like error notification
          type  : 'error',
          title : 'Observing Data',
          body  : 'Failed on '+errors.length+' row(s)'
        });
      };
      
      $http
        .put('/network/'+key, rows)                                           //Do an HTTP PUT to /network/your-key with a JSON body (rows)
        .then(function(resp) {                                                //we need to do some extra handling to work around the current state of affairs with the Redis Modules API & MULTI/EXEC blocks
          if (resp.data.errorRows.length > 0) {                               //If we have error rows, then do some failure notifications
            failedObservation(resp.data.errorRows);
          }
          if (resp.data.successfulRows.length > 0) {                          //If we have success rows, then do some success notifications
            successfulObservation(resp.data.successfulRows);
          }
        });
    };
    $scope.train = function() {
      var
        successfulTrainingStart;
      
      successfulTrainingStart = function() {                                  //Handle the successful start of training a neural network
        toaster.pop({                                                         //Trigger a growl-like notification
          type  : 'success',
          title : 'Training Started'
        });
        $scope.trainParams = {};                                              //reset the training form
      };

      $http
        .patch('/network/'+$scope.neuralKey, $scope.trainParams)              //Do an HTTP PATCH to /network/your-key with the JSON parameters
        .then(
          successfulTrainingStart,                                            //Handle the success
          genericError('Training Start Failed')                               //throw the generic growl notification with the passed text on failure
        );
    };
    $scope.run = function(options) {                                          //we pass in an option depending if the Classify or Run button is clicked
      var
        url = '/network/'+$scope.neuralKey+'/',                               //create the URL - we'll be adding to it later in the function
        successfulRun,
        runInputs = $scope.inputsArr.slice(0);

      successfulRun = function(resp) {                                        //Handle the successful NR.RUN or NR.CLASS
        $scope.responses.push({                                               //We're showing our data below instead of using the notifications for this one
          inputs    : runInputs,
          classify  : options.classify || false,
          response  : resp.data
        });
      };
      
      url += Object.keys($scope.runParams)                                   //Append the URL with a mapped version of the array
        .map(function(anIndex) { return $scope.runParams[anIndex]; })       //Grabbing the run parameters
        .join('/');                                                         //and joining them together to make a nice URL

      if (options.classify) {                                               //If the classify tick box is marked
        url += '?classify=true';                                            //added the classify 
      }

      $http
        .get(url, $scope.runParams)                                         //do a GET request with the run parameters as the body
        .then(successfulRun,genericError('Run/Classify Failed'));           //Handle the success and failure
    };
    $scope.reset = function() {                                             //NR.RESET the neural network
      var
        successfulReset;
      
      successfulReset = function() {                                        //Handle the successful reset of a neural network
        toaster.pop({
          type  : 'success',
          title : $scope.neuralKey+' was reset'
        });
      };
      
      $http
        .delete('/network/'+$scope.neuralKey)                               //Do an HTTP DELETE to /network/your-key 
        .then(successfulReset,genericError('Reset Failed'));                //Handle the success and failure
    };

    $scope.neuralKey = 'net';                                               //Set the default key
    setDefaultCreateParams();                                               //Make sure we have a default set for creation (which is the only thing shown if the 'net' neural network has not been created)                               
    $scope.getInfo();                                                       //get info for 'net'
  });