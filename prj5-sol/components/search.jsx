//-*- mode: rjsx-mode;

'use strict';

const React = require('react');

class Search extends React.Component {

  /** called with properties:
   *  app: An instance of the overall app.  Note that props.app.ws
   *       will return an instance of the web services wrapper and
   *       props.app.setContentName(name) will set name of document
   *       in content tab to name and switch to content tab.
   */
  constructor(props) {
    super(props);
    this.init_value = '';
    this.state = { input: this.init_value, input_fixed: this.init_value,
                   search_results: {results:[]}, errors: '', formErrors: [] };
    this.onBlur = this.onBlur.bind(this);
    this.onChange = this.onChange.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
    this.onClick = this.onClick.bind(this);
  }
  
  reset() {
    this.setState({ input: this.init_value, input_fixed: this.init_value, errors: {} });
  }
  
  /************************Utility Function******************************/
  errors() { return this.state.errors; }

  values() { return this.state.values; }

  hasErrors() { return Object.keys(this.state.errors).length > 0; }

  setFormErrors(errors) { this.setState({formErrors: errors}); }

  addError(name, msg) {
    const updated = Object.assign({}, this.state.errors, {[name]: msg});
    this.setState({errors: updated});
  }
  
  deleteError(name) {
    const updated = Object.assign({}, this.state.errors);
    delete updated[name];
    this.setState({errors: updated});
  }
  /*********************************************************************/
   
  // call onSubmit when blur
  onBlur(event) {
    const target = event.target;
    const name = target.name;
    const value = target.value;
     
    this.onSubmit(event);
  }
   
  // update state whenever users update
  onChange(event) {
    const target = event.target;
    const name = target.name;
    const value = target.value || '';
     
    this.setState({ input: value });
  }
   
  onClick(event, doc_name) {
    event.preventDefault();
    this.props.app.setContentName(doc_name);
  }
  
  // submit to web server
  async onSubmit(event) {
    event.preventDefault();
    
    try {
      let results = await this.props.app.ws.searchDocs(this.state.input);
       
      if (results.totalCount === 0 && this.state.input !== '') {
        let error = "No results for " + this.state.input; 
        this.setState({ errors: error });
      }
      else {
        this.setState({ errors: '' });
      }
       
      this.setState({ search_results: results});
      this.setState({ input_fixed: this.state.input });
    } 
    catch (error) {
      this.setState({ errors: error.message });
    }
  }
   
  render() {
    const {errors} = this.state;
     
    let search_terms = this.state.input_fixed.split(/(\s+)/).filter(term => term.trim().length > 0);
     
    let results_display = this.state.search_results.results.map(obj => {
      // process lines 
      let lines = obj.lines;
      
      lines = lines.map(line => {
        let line_temp = line;
        let line_split = line_temp.split(new RegExp(`(${search_terms.join("|")})`, "g"));
        
        line_split = line_split.map(word => {
          let match = "";
          for (let term of search_terms) {
            if (word === term) {
              match = word;
            }
          }
           
          if (match !== "") {
            return <span key={Math.random()} className="search-term">{word}</span>;
          }
          else {
            return word;
          }
        });
        return line_split;
      });
      
      let new_lines = [];
      for (let i = 0; i < lines.length; i++) {
        for (let j = 0; j < lines[i].length; j++) {
          new_lines.push(lines[i][j]);
        }
        new_lines.push(<br key={Math.random()}></br>);
      }
      
      // process other part 
      return (
        <div className="result" key={Math.random()}>
        <a className="result-name" key={Math.random()} 
          onClick={()=>{this.onClick(event, obj.name)}} 
          value={obj.name} href={obj.href}>{obj.name}</a>
        <br key={Math.random()}></br>
        <p key={Math.random()}>{new_lines}</p>
        </div>
      );
    });
    
    return (
      <div>
        <div>
          <form onSubmit={this.onSubmit}>
            <label>
              <span className="label">Search Terms:</span>
              <span className="control">
                <input id="q" name="q" value={this.state.input} 
                  onChange={this.onChange} onBlur={this.onBlur} />
                <br></br>
              </span>
            </label>
          </form>
        </div>
        <div key={Math.random()}>{results_display}</div>
        <span className="error" key={Math.random()}>{errors}</span>
      </div>
    );
  }
}

module.exports = Search;
