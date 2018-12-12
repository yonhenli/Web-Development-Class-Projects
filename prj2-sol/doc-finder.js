const assert = require('assert');
const mongo = require('mongodb').MongoClient;

const {inspect} = require('util'); //for debugging

'use strict';

/** This class is expected to persist its state.  Hence when the
 *  class is created with a specific database url, it is expected
 *  to retain the state it had when it was last used with that URL.
 */ 
class DocFinder {

  /** Constructor for instance of DocFinder. The dbUrl is
   *  expected to be of the form mongodb://SERVER:PORT/DB
   *  where SERVER/PORT specifies the server and port on
   *  which the mongo database server is running and DB is
   *  name of the database within that database server which
   *  hosts the persistent content provided by this class.
   */
  constructor(dbUrl) {
    //for mongodb
    this.client;
    this.db;
    this.db_url = dbUrl.substring(0, dbUrl.lastIndexOf('/'));
    this.db_name = dbUrl.substring(dbUrl.lastIndexOf('/')+1);
    
    // store info in memory
    this.noise_words;// a set
  }

  /** This routine is used for all asynchronous initialization
   *  for instance of DocFinder.  It must be called by a client
   *  immediately after creating a new instance of this.
   */
  async init() {
    this.client = await mongo.connect(this.db_url);
    this.db = await this.client.db(this.db_name);
  }

  /** Release all resources held by this doc-finder.  Specifically,
   *  close any database connections.
   */
  async close() {
    await this.client.close();
  }
  
  /** Clear database */
  async clear() {
    await this.db.dropDatabase();
  }

  /** Return an array of non-noise normalized words from string
   *  contentText.  Non-noise means it is not a word in the noiseWords
   *  which have been added to this object.  Normalized means that
   *  words are lower-cased, have been stemmed and all non-alphabetic
   *  characters matching regex [^a-z] have been removed.
   */
  async words(content) {
    var return_list = [];
    return_list = await this._wordsLow(content);

    return return_list.map(pair => pair[0]);
  }

  async _wordsLow(content) {
		let match;
    let word_i;
    let word_list=[];
    
    // if noise words has not been loaded into memory
    if (this.noise_words === undefined) {
      var noise_words_objs = await this.db.collection("noise_words").find().toArray();
      this.noise_words = noise_words_objs.map(item => item["_id"]);
      this.noise_words = new Set(this.noise_words); // convert to a set
    }
    
		while(match = WORD_REGEX.exec(content)) {
			const [word, offset] = [match[0], match.index];
      word_i = word; 
      word_i = normalize(word_i); 
      if (!this.noise_words.has(word_i)) {
        word_list.push([word_i,offset]);
      }
		}

    return word_list;
  }
  /** Add all normalized words in the noiseText string to this as
   *  noise words.  This operation should be idempotent.
   */
  async addNoiseWords(noiseWords) {
    var noise_words = new Set(noiseWords.split(/\r?\n/));
    noise_words = Array.from(noise_words);
     
    var collection = await this.db.createCollection("noise_words");
     
    for (var i = 0; i < noise_words.length; i++) {
      await collection.updateOne({"_id": noise_words[i]}, {$set : {"_id": noise_words[i]}},
                              {upsert : true});
    }
  }

  /** Add document named by string name with specified content string
   *  contentText to this instance. Update index in this with all
   *  non-noise normalized words in contentText string.
   *  This operation should be idempotent.
   */ 
  async addContent(name, content) {
    var counter = 0;
    var offset = 0;
    var word_list; // [[word,offset]...] 
    var word_index = new Map();
    word_list = await this._wordsLow(content);
    
    // process words in the memory 
    for (let word of word_list) {
      if (word_index.has(word[0])) {
        counter = word_index.get(word[0])[0];
        offset = word_index.get(word[0])[1];
        word_index.set(word[0], [counter+1, offset]);
      }
      else {
        word_index.set(word[0], [1, word[1]]);
      }
    }
     
    // store original document
    await this.db.collection("documents").updateOne({"_id" : name}, {$set : 
              {"_id" : name, "content" : content}}, {upsert : true});
      
    // store words into database
    var collection = await this.db.createCollection(name); 
    var all_words = await this.db.collection("all_words");
    
    for (let [word, ct_off] of word_index) {
      await collection.updateOne({"_id" : word}, 
         {$set : {"_id" : word, "count" : ct_off[0], "offset" : ct_off[1]}}, {upsert : true});
      await all_words.updateOne({"_id" : word}, {$set : {"_id" : word}}, {upsert : true});
    }
  }

  /** Return contents of document name.  If not found, throw an Error
   *  object with property code set to 'NOT_FOUND' and property
   *  message set to `doc ${name} not found`.
   */
  async docContent(name) {
    var content = await this.db.collection("documents").find({"_id" : name}).toArray(); 
    
    if (content.length === 0)
      throw new UserError('NOT_FOUND', 'doc ' + name + ' not found');
    
    return content[0]["content"];
  }
  
  /** Given a list of normalized, non-noise words search terms, 
   *  return a list of Result's  which specify the matching documents.  
   *  Each Result object contains the following properties:
   *
   *     name:  the name of the document.
   *     score: the total number of occurrences of the search terms in the
   *            document.
   *     lines: A string consisting the lines containing the earliest
   *            occurrence of the search terms within the document.  The 
   *            lines must have the same relative order as in the source
   *            document.  Note that if a line contains multiple search 
   *            terms, then it will occur only once in lines.
   *
   *  The returned Result list must be sorted in non-ascending order
   *  by score.  Results which have the same score are sorted by the
   *  document name in lexicographical ascending order.
   *
   */
  async find(terms) {
    var j = 0;
    var k = 0;
    var result;
    var return_list = [];
    var offset_map = new Map();
    
    // store info from database
    var doc_name_list;
    var content_cur = undefined; // store current document
    var words_obj_list_cur; // a list of objs
    var words_map_cur = new Map();
    
    // retrive all of the document names
    doc_name_list = await this.db.collection("documents").find().toArray(); 
    doc_name_list = doc_name_list.map(item => item["_id"]); // convert to a list
    
    for (const doc_name of doc_name_list) {
      
      // retrive all words asscociated with this document 
      words_obj_list_cur = await this.db.collection(doc_name).find().toArray(); 
      
      // build a map to save searching time
      for (const word_obj of words_obj_list_cur) {
        words_map_cur.set(word_obj["_id"], [word_obj["count"], word_obj["offset"]]); 
      }
      
      // loop through all of terms
      for (const term of terms) {
        // if found a term 
        if(words_map_cur.has(term)) {
          if (content_cur === undefined) {
            // retrive a whole document 
            content_cur = await this.docContent(doc_name);
          }
          
          result = new Result(doc_name, words_map_cur.get(term)[0],
                   lineAt(content_cur, words_map_cur.get(term)[1]).concat("\n")); 
          
          offset_map.set(result, words_map_cur.get(term)[1]);
          
          return_list.push(result);
        }
      }
       
      // clear variable after each round 
      words_map_cur.clear();
      content_cur = undefined;
    } 
    
    // process output
    for (var i = 0; i < return_list.length; i++) {
      for (var j = i+1; j < return_list.length; j++) {
        // combine multiple words in a document 
        if (return_list[i].name === return_list[j].name) {
          // add to i => remove j => j--
          if (return_list[i].lines === return_list[j].lines);  
          else if (offset_map.get(return_list[i]) < offset_map.get(return_list[j])) {
            return_list[i].lines = return_list[i].lines + return_list[j].lines;  
          }
          else if (offset_map.get(return_list[i]) > offset_map.get(return_list[j])) {
            return_list[i].lines = return_list[j].lines + return_list[i].lines;
          }
          
          return_list[i].score = return_list[j].score + return_list[i].score; 
          return_list.splice(j,1);
          j--; // to test
        }
      }
    }
    
    return_list.sort(compareResults);
    
    return return_list;
  }

  /** Given a text string, return a ordered list of all completions of
   *  the last normalized word in text.  Returns [] if the last char
   *  in text is not alphabetic.
   */
  async complete(text) {
    var all_words_objs = await this.db.collection("all_words").find().toArray();
    var all_words_list = all_words_objs.map(item => item["_id"]);
    
    var return_list = all_words_list.filter((word) => word.startsWith(text));
    
    if (return_list.length === 0) return []; 
    
    return_list.sort(function(a,b) { return (a < b ) ? -1: (a > b) ? 1 : 0; });

    return return_list;
  }

} //class DocFinder

module.exports = DocFinder;

//Add module global functions, constants classes as necessary
//(inaccessible to the rest of the program).

//Used to prevent warning messages from mongodb.
const MONGO_OPTIONS = {
  useNewUrlParser: true
};

/** Regex used for extracting words as maximal non-space sequences. */
const WORD_REGEX = /\S+/g;

/** A simple class which packages together the result for a 
 *  document search as documented above in DocFinder.find().
 */ 
class Result {
	constructor(name, score, lines) {
	this.name = name; this.score = score; this.lines = lines;
	}

	toString() { return `${this.name}: ${this.score}\n${this.lines}`; }
}

/** Compare result1 with result2: higher scores compare lower; if
*  scores are equal, then lexicographically earlier names compare
*  lower.
*/
function compareResults(result1, result2) {
	return (result2.score - result1.score) ||
	result1.name.localeCompare(result2.name);
}

/**
 * result1 Result 
 * result2 Result
 */
function compare(result1, result2) {
  if (result1.score < result2.score) return 1;
  if (result1.score > result1.score) return -1;
  else {
    if (result1.name < result2.name) return -1;
    if (result1.name > result2.name) return 1;
  }
  return 0;
}
/** Normalize word by stem'ing it, removing all non-alphabetic
 *  characters and converting to lowercase.
 */
function normalize(word) {
	return stem(word.toLowerCase()).replace(/[^a-z]/g, '');
}

/** Place-holder for stemming a word before normalization; this
 *  implementation merely removes 's suffixes.
 */
function stem(word) {
	return word.replace(/\'s$/, '');
}

function lineAt(text, offset) {
  var line = text.charAt(offset) === '\n' ? '' : text.substring(text.lastIndexOf('\n',offset) 
    !==-1 ? text.lastIndexOf('\n',offset)+1:0, text.indexOf('\n',offset) 
    !== -1 ? text.indexOf('\n',offset) : text.length);

	return line; 
}

function UserError(code, msg) {
  this.errorCode = code;
  this.message = msg;
}