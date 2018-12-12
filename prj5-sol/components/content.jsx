//-*- mode: rjsx-mode;

'use strict';

const React = require('react');

class Content extends React.Component {

  /** called with properties:
   *  app: An instance of the overall app.  Note that props.app.ws
   *       will return an instance of the web services wrapper and
   *       props.app.setContentName(name) will set name of document
   *       in content tab to name and switch to content tab.
   *  name:Name of document to be displayed.
   */
  constructor(props) {
    super(props);
    this.state = {
      doc_content : "",
      doc_name: ""
    };
  }
  
  async componentDidMount() {
    if (this.props.name !== undefined && this.props.name != this.state.doc_name) {
      let content_temp = await this.props.app.ws.getContent(this.props.name);
      this.setState({ doc_content: content_temp.content });
      this.setState({ doc_name: this.props.name });
      
      //console.log("Mount: after change: ");
      //console.log("doc_name: ", this.state.doc_name);
      //console.log("doc_content: ", this.state.doc_content);
    }
  }
  
  async componentDidUpdate(pre_props, pre_state) {
    if (this.props.name !== undefined && this.props.name != pre_state.doc_name) {
      let content_temp = await this.props.app.ws.getContent(this.props.name);
      this.setState({ doc_content: content_temp.content });
      this.setState({ doc_name: this.props.name });
      
      //console.log("Update: after change: ");
      //console.log("doc_name: ", this.state.doc_name);
      //console.log("doc_content: ", this.state.doc_content);
    }
  }
  
  render() {
    return (
      <div>
      <h1>{this.state.doc_name}</h1>
      <pre>{this.state.doc_content}</pre>
      </div>
    );
  }
}

module.exports = Content;
