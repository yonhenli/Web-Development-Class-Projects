'use strict';

const express = require('express');

//const upload = require('multer')();
const multer  = require('multer');
const upload = multer();
const bodyParser = require('body-parser');
const querystring = require('querystring');

const fs = require('fs');
const mustache = require('mustache');
const Path = require('path');
const { URL } = require('url');

const STATIC_DIR = 'statics';
const TEMPLATES_DIR = 'templates';

function serve(port, base, model) {
  const app = express();
  app.locals.port = port;
  app.locals.base = base;
  app.locals.model = model;
  process.chdir(__dirname);
  app.use(base, express.static(STATIC_DIR));
  setupTemplates(app, TEMPLATES_DIR);
  setupRoutes(app);
  app.listen(port, function() {
    console.log(`listening on port ${port}`);
  });
}

module.exports = serve;

/******************************** Routes *******************************/

function setupRoutes(app) {
  const base = app.locals.base;
  app.get(`${base}/search.html`, doSearch(app));
 
  app.get(`${base}/add.html`, createDocsForm(app));
  app.post(`${base}/add`, upload.single('file'), createDocs(app));

  app.get(`${base}/:name`, getDocs(app)); //must be last
}

/************************** Field Definitions **************************/

const FIELDS_INFO = {
  file: {
    friendlyName: 'Choose file',
    isId: 'true',
    id: 'file',
    type: 'file', 
  },
  q: {
    friendlyName: 'Search Terms',
    id: 'query',
    isSearch: 'true',
  },

}

const FIELDS = Object.keys(FIELDS_INFO).map((n) => Object.assign({name: n}, FIELDS_INFO[n]));

/*************************** Action Routines ***************************/

function createDocsForm(app) {
  return async function(req, res) {
    const model = { base: app.locals.base, fields: FIELDS };
    const html = doMustache(app, 'create', model);
    res.send(html);
  };
};

function createDocs(app) {
  return async function(req, res) {
    // validate file 
    let errors = validate(req, ['file']);

    if (!errors) {
      let doc = {};
      doc.name = req.file.originalname.replace(/\.[^/.]+$/, ""); 
      doc.content = req.file.buffer.toString('utf-8');
      doc.base = app.locals.base; 

      const doc_non_empty = getNonEmptyValues(doc);
      
      try {
        await app.locals.model.create(doc_non_empty);
        res.redirect(`${app.locals.base}/${doc_non_empty.name}`);
      }
      catch (err) {
        console.error(err);
        errors = wsErrors(err);
      }
    } 
    
    if (errors) {
      const model = errorModel(app, {}, errors);
      const html = doMustache(app, 'create', model);
      res.send(html);
    }

  };
};

//app.get(`${base}/:name`, getDocs(app)); //must be last
function getDocs(app) {
  return async function(req, res) {
    let model;
    const name = req.params.name;
    try {
      const docs = await app.locals.model.get(name);
       
      model = {};
      model.base = app.locals.base;
      model.name = name;
      model.content = docs.content;
    }
    
    catch (err) {
      console.error(err);
      const errors = wsErrors(err);
      model = errorModel(app, {}, errors);
    }
    
    const html = doMustache(app, 'create_results', model);
    res.send(html);
  };
};

// app.get(`${base}/search.html`, doSearch(app));
function doSearch(app) {
  return async function(req, res) {
    // do not display error msg first time
    const isSubmit = req.query.submit !== undefined;
    
    let docs = [];
    let errors = undefined;
    const search = getNonEmptyValues(req.query);
    
    let req_to_send = {};

    if (isSubmit) {
      errors = validate(search);
      
      // check if there is a user input
      if (search.q === undefined) {
        const msg = 'at least one search parameter must be specified';
        errors = Object.assign(errors || {}, { _: msg });
      }
       
      if (!errors) {
        delete search['submit'];
        const q = querystring.stringify(search);

        try {
          docs = await app.locals.model.list(q);

        }
	      catch (err) {
          console.error(err);
	        errors = wsErrors(err);
	      }
         
        if (docs.totalCount === 0) {
          errors = {_: 'no document containing \"' + search.q + '\" found; please retry'};
        }
      }
    }
     
    let model;
    let template = 'search';
    
    //console.log("-------------------docs-----------------\n", docs);
    if (docs.totalCount > 0) {
        //console.log("search.q: ", search.q);
        const search_terms = search.q.split(' ');
        // to generate the special term html
        let html_p1 = '<span class="search-term">';
        let html_p2 = '</span>';
        let html_f; // to be combined
      
      const results = docs.results.map(function(doc) {
        let ret = {};
        ret.doc_name = doc.name;
        ret.href = relativeUrl(req,ret.doc_name);
        
        // parse lines here
        ret.lines = doc.lines;
        
        for (let i in ret.lines) {
          for (let j in search_terms) {
            if (ret.lines[i].indexOf(search_terms[j]) !== -1) {
              // generate html string
              html_f = html_p1 + search_terms[j] + html_p2;
               
              // replace the target term 
              ret.lines[i] = ret.lines[i].replace(search_terms[j], html_f); 
            }
          }
        } 
        return ret;
      }); 
      
      model = errorModel(app, search, errors);
      
      model.isSearchResults = true;
      model.searchResults = results;
    }
    // error occurs
    else {
      model = errorModel(app, search, errors);
    }
    
    const html = doMustache(app, template, model);
    res.send(html);
  };
};

/************************ General Utilities ****************************/

/** return object containing all non-empty values from object values */
function getNonEmptyValues(values) {
  const out = {};
  Object.keys(values).forEach(function(k) {
    const v = values[k];
    if (v && v.trim().length > 0) out[k] = v.trim();
  });
  return out;
}


/** Return a URL relative to req.originalUrl.  Returned URL path
 *  determined by path (which is absolute if starting with /). For
 *  example, specifying path as ../search.html will return a URL which
 *  is a sibling of the current document.  Object queryParams are
 *  encoded into the result's query-string and hash is set up as a
 *  fragment identifier for the result.
 */
function relativeUrl(req, path='', queryParams={}, hash='') {
  const url = new URL('http://dummy.com');
  url.protocol = req.protocol;
  url.hostname = req.hostname;
  url.port = req.socket.address().port;
  url.pathname = req.originalUrl.replace(/(\?.*)?$/, '');
  url.pathname = url.pathname.substr(0, url.pathname.lastIndexOf("\/"));
  if (path.startsWith('/')) {
    url.pathname = path;
  }
  else if (path) {
    url.pathname += `/${path}`;
  }
  url.search = '';
  Object.entries(queryParams).forEach(([k, v]) => {
    url.searchParams.set(k, v);
  });
  url.hash = hash;
  return url.toString();
}

/** Given map of field values and requires containing list of required
 *  fields, validate values.  Return errors hash or falsy if no errors.
 */
function validate(values, requires=[]) {
  const errors = {};
  requires.forEach(function (name) {
    if (values[name] === undefined) {
      
      if (name === 'file') {
        errors[name] = 'please select a file containing a document to upload'; 
      }
      else {
        // TO-DO
        errors[name] = `A value for '${FIELDS_INFO[name].friendlyName}' must be provided`;
      }
    }
  });

  return Object.keys(errors).length > 0 && errors;
}

/** Return a model suitable for mixing into a template */
function errorModel(app, values={}, errors={}) {
  return {
    base: app.locals.base,
    errors: errors._,
    fields: fieldsWithValues(values, errors)
  };
}

function fieldsWithValues(values, errors={}) {
  return FIELDS.map(function (info) {
    const name = info.name;
    const extraInfo = { value: values[name] };
    if (errors[name]) extraInfo.errorMessage = errors[name];
    return Object.assign(extraInfo, info);
  });
}

/** Decode an error thrown by web services into an errors hash
 *  with a _ key.
 */
function wsErrors(err) {
  const msg = (err.message) ? err.message : 'web service error';
  console.error(msg);
  return { _: [ msg ] };
}
/************************** Template Utilities *************************/


/** Return result of mixing view-model view into template templateId
 *  in app templates.
 */
function doMustache(app, templateId, view) {
  const templates = { footer: app.templates.footer };
  return mustache.render(app.templates[templateId], view, templates);
}

/** Add contents all dir/*.ms files to app templates with each 
 *  template being keyed by the basename (sans extensions) of
 *  its file basename.
 */
function setupTemplates(app, dir) {
  app.templates = {};
  for (let fname of fs.readdirSync(dir)) {
    const m = fname.match(/^([\w\-]+)\.ms$/);
    if (!m) continue;
    try {
      app.templates[m[1]] =
	String(fs.readFileSync(`${TEMPLATES_DIR}/${fname}`));
    }
    catch (e) {
      console.error(`cannot read ${fname}: ${e}`);
      process.exit(1);
    }
  }
}