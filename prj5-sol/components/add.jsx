//-*- mode: rjsx-mode;

'use strict';

const React = require('react');

class Add extends React.Component {

  /** called with properties:
   *  app: An instance of the overall app.  Note that props.app.ws
   *       will return an instance of the web services wrapper and
   *       props.app.setContentName(name) will set name of document
   *       in content tab to name and switch to content tab.
   */
  constructor(props) {
    super(props);
    this.onChange = this.onChange.bind(this);
  }

  //Note that a you can get information on the file being uploaded by
  //hooking the change event on <input type="file">.  It will have
  //event.target.files[0] set to an object containing information
  //corresponding to the uploaded file.  You can get the contents
  //of the file by calling the provided readFile() function passing
  //this object as the argument.
  async onChange(event) {
    let doc_name = event.target.files[0].name;
    doc_name = doc_name.split('.').slice(0, -1).join('.');
    
    let doc_content = await readFile(event.target.files[0]); 
    
    await this.props.app.ws.addContent(doc_name, doc_content);
    
    this.props.app.setContentName(doc_name);
  }

  render() {
    return (
      <form>
        <label className='label'>
        Choose File: 
        <input className="control" type="file" onChange={this.onChange}></input>
        </label>
      </form>
    );
  }
}

module.exports = Add;

/** Return contents of file (of type File) read from user's computer.
 *  The file argument is a file object corresponding to a <input
 *  type="file"/>
 */
async function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>  resolve(reader.result);
    reader.readAsText(file);
  });
}
