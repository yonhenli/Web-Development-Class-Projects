'use strict';

const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const process = require('process');
const url = require('url');
const queryString = require('querystring');



const ERROR_MAP = {
  OK : 200,
  CREATED : 201,
  BAD_REQUEST : 400,
  NOT_FOUND : 404,
  CONFLICT : 409,
  SERVER_ERROR : 500,
  BAD_PARAM: 400
}

//Main URLs
const DOCS = '/docs';
const COMPLETIONS = '/completions';

//Default value for count parameter
const COUNT = 5;

/** Listen on port for incoming requests.  Use docFinder instance
 *  of DocFinder to access document collection methods.
 */
function serve(port, docFinder) {
  const app = express();
  app.locals.port = port;
  app.locals.finder = docFinder;
  setupRoutes(app);
  const server = app.listen(port, async function() {
    console.log(`PID ${process.pid} listening on port ${port}`);
  });
  return server;
}

module.exports = { serve };

function setupRoutes(app) {
  app.use(cors());            //for security workaround in future projects
  app.use(bodyParser.json()); //all incoming bodies are JSON

  //@TODO: add routes for required 4 services
  app.get('/docs/:name', getContent(app));
  app.get('/completions', getCompletion(app));
  app.get('/docs', searchContent(app));
  app.post('/docs', addContent(app));

  app.use(doErrors()); //must be last; setup for server errors   
}

//@TODO: add handler creation functions called by route setup
//routine for each individual web service.  Note that each
//returned handler should be wrapped using errorWrap() to
//ensure that any internal errors are handled reasonably.

function addContent(app) {
  return errorWrap(async function(req, res) {
    try {
      const body = req.body;
      const name = body.name;
      const content = body.content;
      // check name  
      if (name === undefined) {
        throw {
          isDomain: true,
          errorCode: "BAD_REQUEST",
          message: "required query parameter \"name\" is missing"
        };
      }
      // check content
      if (content === undefined) {
        throw {
          isDomain: true,
          errorCode: "BAD_REQUEST",
          message: "required query parameter \"content\" is missing"
        };
      }
      
      await app.locals.finder.addContent(name, content);

      res.append('Location', res.originalUrl + '/' + name);

      res.status(ERROR_MAP["CREATED"]).json({
        href: req.protocol + '://' + req.get('host') + '/docs/' + name 
      });
    }
    catch (err) {
      const mapped = mapError(err);
      res.status(ERROR_MAP[mapped.code]).json(mapped);
    }

  });
}

function isNormalInteger(str) {
    return /^\+?(0|[1-9]\d*)$/.test(str);
}

function searchContent(app) {
  return errorWrap(async function(req, res) { 
    try {
      const query = req.query || {};
      const q = query.q;
      // check wether required q presents
      if (q === undefined) {
        throw {
          isDomain: true,
          errorCode: "BAD_REQUEST",
          message: "required query parameter \"q\" is missing"
        };
      }
      let limit = query.count || '5';
      let start = query.start || '0'; // to parse later

      // variables to process results 
      let count = 0; 
      let returns_obj = {}; 
      let returns_list = [];
      let returns_links = [];
      let prev_start = 0;
      let next_start = 0;

      const results = await app.locals.finder.find(q);
     
      // check start and limit 
      // check whether it is a number and whether it is in reasonable range
      if (!isNormalInteger(start) || start < 0 || start > results.length) {
        throw {
          isDomain: true,
          erroCode: "BAD_REQUEST",
          message: "bad query parameter \"start\""
        }
      } 
      if (!isNormalInteger(limit) || limit < 0) {
        throw {
          isDomain: true,
          erroCode: "BAD_REQUEST",
          message: "bad query parameter \"count\""
        }
      } 
      
      // convert start from str to num 
      start = Number(start);
      limit = Number(limit);

      // CASE 1: no result 
      if (results.length === 0) {}
      // CASE 2: has result
      else {
        for (var i = start; i < results.length; i++) {
          returns_list.push(
            {
              name: results[i].name,
              score: results[i].score,
              lines: results[i].lines, 
              href: req.protocol + '://' + req.get('host') + '/docs/' + results[i].name  
            }
          ); 
          
          count++;
          if (count == limit) break;
        }
      }

      // format returns_obj
      // previous start 
      if (start === 0 || results.length === 0) 
        prev_start = -1; // -1 indicates none 
      else if (start - count < 0)
        prev_start = 0; // exceed boundary
      else 
        prev_start = start - limit; // normal case 
       
      // next start 
      if (start + limit > results.length) 
        next_start = -1; // -1 indicates none
      else 
        next_start = start + limit; // normal case
        
      // push self 
      let temp_obj = {
        q: q,
        start: start,
        count: limit
      }

      const url_end_self = queryString.stringify(temp_obj);

      returns_links.push(
        {
          rel: "self",
          href: req.protocol + '://' + req.get('host') + '/docs?' + url_end_self 
        }
      );
      // push previous 
      if (prev_start !== -1) {
        let temp_obj = {
          q: q,
          start: prev_start,
          count: limit
        }
        
        const url_end_prev = queryString.stringify(temp_obj);

        returns_links.push(
          {
            rel: "previous",
            href: req.protocol + '://' + req.get('host') + '/docs?' + url_end_prev 
          }
        );
      }
      // push next
      if (next_start !== -1) {
        let temp_obj = {
          q: q,
          start: next_start,
          count: limit
        }
        
        const url_end_next = queryString.stringify(temp_obj);

        returns_links.push(
          {
            rel: "next",
            href: req.protocol + '://' + req.get('host') + '/docs?' + url_end_next 
          }
        );
      }
      
      // format return object
      returns_obj.results = returns_list;
      returns_obj.totalCount = results.length;
      returns_obj.links = returns_links;
      
      // send to client 
      res.json(returns_obj);
    } 
    catch(err) {
      const mapped = mapError(err);
      res.status(ERROR_MAP[mapped.code]).json(mapped);
    }
  });
}

function getContent(app) {
  return errorWrap(async function(req, res) {
    try {
      const name = req.params.name;

      // catch NOT_FOUND error here
      try {
        const results = await app.locals.finder.docContent(name);
        res.json(
          {
            content: results,
            links: [{
              rel: "self",
              href: req.protocol + '://' + req.get('host') + req.originalUrl
            }]
          }
        );
        //res.sendStatus(OK);
      }
      catch (err) {
        throw {
          isDomain: true,
          errorCode: "NOT_FOUND",
          message: err.message
        };
      }

    }
    catch(err) {
      const mapped = mapError(err);
      res.status(ERROR_MAP[mapped.code]).json(mapped);
    }
  });
}

function getCompletion(app) {
  return errorWrap(async function(req, res) {
    try {
      const query = req.query || {};
      
      // param check
      if (query.text === undefined) 
        throw {
          isDomain: true,
          erroCode: "BAD_REQUEST",
          message: "required query parameter \"text\" is missing"
        }
      
      const text = query.text;
      
      const results = await app.locals.finder.complete(text);
      
      res.json(results);
    }
    catch(err) {
      const mapped = mapError(err);
      res.status(ERROR_MAP[mapped.code]).json(mapped);
    }
  });
}

/** Return error handler which ensures a server error results in nice
 *  JSON sent back to client with details logged on console.
 */ 
function doErrors(app) {
  return async function(err, req, res, next) {
    res.status(ERROR_MAP["SERVER_ERROR"]);
    res.json({ code: 'SERVER_ERROR', message: err.message });
    console.error(err);
  };
}

/** Set up error handling for handler by wrapping it in a 
 *  try-catch with chaining to error handler on error.
 */
function errorWrap(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    }
    catch (err) {
      next(err);
    }
  };
}

/** Return base URL of req for path.
 *  Useful for building links; Example call: baseUrl(req, DOCS)
 */
function baseUrl(req, path='/') {
  const port = req.app.locals.port;
  const url = `${req.protocol}://${req.hostname}:${port}${path}`;
  return url;
}

function mapError(err) {
  //console.error(err);
  //console.log("erroCode: ", err.errorCode);
  //console.log("status: ", ERROR_MAP[err.errorCode]);
  //:wconsole.log(ERROR_MAP);
  return err.isDomain
    ? { 
        code: (err.errorCode || "BAD_REQUEST"),
	      message: err.message
      }
    : { 
        code: "SERVER_ERROR",
        message: err.toString()
      };
}
