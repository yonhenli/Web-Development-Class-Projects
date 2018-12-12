const {inspect} = require('util'); //for debugging

'use strict';

class DocFinder {

	/** Constructor for instance of DocFinder. */
	constructor() {
    this.documents = new Map();
    this.indexes = new Map();
    this.noise_words;
    this.word_list = []; // a list of words for tab completion
    this.word_set;
	}

	/** Return array of non-noise normalized words from string content.
	*  Non-noise means it is not a word in the noiseWords which have
	*  been added to this object.  Normalized means that words are
	*  lower-cased, have been stemmed and all non-alphabetic characters
	*  matching regex [^a-z] have been removed.
	*/
	words(content) {
    var return_list = [];
    
    return_list = this._wordsLow(content).map(pair => pair[0]);
	  
    return return_list;
	}

	/** returns a list of pairs: [word, offest]
	 */
	_wordsLow(content) {
		let match;
    let word_i;
    let word_list=[];

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

	/** Add all normalized words in noiseWords string to this as
	*  noise words. 
	*/
	addNoiseWords(noiseWords) {
	  //@TODO
    this.noise_words = new Set(noiseWords.split(/\r?\n/));
	}

	/** Add document named by string name with specified content to this
	*  instance. Update index in this with all non-noise normalized
	*  words in content string.
	*/ 
	addContent(name, content) {
    var counter = 0;
    var offset = 0;
    let word_list; // [[word,offset]...]
    this.documents.set(name, content);
    this.indexes.set(name, new Map()); 
    word_list = this._wordsLow(content);
    
    for (var i = 0; i < word_list.length; i++) {
      if (! this.indexes.get(name).has(word_list[i][0])) {
        this.indexes.get(name).set(word_list[i][0], [1, word_list[i][1]]);
      }
      else {
        counter = this.indexes.get(name).get(word_list[i][0])[0];
        offset = this.indexes.get(name).get(word_list[i][0])[1];
        this.indexes.get(name).set(word_list[i][0], [counter+1, offset]);
      }
    }
    
    // add words for tab completion 
    var keys = Array.from(this.indexes.get(name).keys());
    this.word_list = this.word_list.concat(keys);
  }
  
	/** Given a list of normalized, non-noise words search terms, 
	*  return a list of Result's  which specify the matching documents.  
	*  Each Result object contains the following properties:
	*     name:  the name of the document.
	*     score: the total number of occurrences of the search terms in the
	*            document.
	*     lines: A string consisting the lines containing the earliest
	*            occurrence of the search terms within the document.  Note
	*            that if a line contains multiple search terms, then it will
	*            occur only once in lines.
	*  The Result's list must be sorted in non-ascending order by score.
	*  Results which have the same score are sorted by the document name
	*  in lexicographical ascending order.
	*
	*/
	find(terms) {
    var j = 0;
    var k = 0;
    var result;
    var return_list = [];
    var offset_map = new Map();

    for (var i = 0; i < terms.length; i++) {
      // structure of indexes {document_name:{score, offset of first occurance}...}
      for (var name of this.indexes.keys()) {
        if (this.indexes.get(name).has(terms[i])) {
         
          // to find the line by a index in between
          j  = k = this.indexes.get(name).get(terms[i])[1];
          while(this.documents.get(name).charAt(j) != "\n" && j > 0) {
            j--;
          }
          while(this.documents.get(name).charAt(k) != "\n" && j <
                this.documents.get(name).length) {
            k++;
          }
           
          result = new Result(name, this.indexes.get(name).get(terms[i])[0], 
                              this.documents.get(name).substring(j+1, k+1));
          
          offset_map.set(result, this.indexes.get(name).get(terms[i])[1]);
          return_list.push(result);
        }
      }
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
	*  the last word in text.  Returns [] if the last char in text is
	*  not alphabetic.
	*/
	complete(text) {
    if (this.word_set === undefined) {
      this.word_set = new Set(this.word_list);
      this.word_list = Array.from(this.word_set);
    }
   
    var return_list = this.word_list.filter((word) => word.startsWith(text));
    
    if (return_list.length === 0) return []; 
    
    return_list.sort(function(a,b) { return (a < b ) ? -1: (a > b) ? 1 : 0; });

    return return_list;
	}
  
} //class DocFinder

module.exports = DocFinder;

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
