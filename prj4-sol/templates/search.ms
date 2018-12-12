<!DOCTYPE html>
<html>
  <head>
    <title>Documents Collection Search</title>
    <link rel="stylesheet" href="{{{base}}}/css/style.css">
  </head>
  <body>
    <h1>Documents Collection Search</h1>
    <ul>
      {{#errors}}
        <li class="error">{{.}}</li>
      {{/errors}}
    </ul>
    <form method="GET" action="{{{base}}}/search.html">
      <p>
	      Please fill in one or more search terms in the field below:
      </p>
	    {{#fields}}
        {{#isSearch}}
        <label>
        <span class="label">{{friendlyName}}:</span>
        <input id="{{id}}" name="{{name}}" value="{{value}}">
        </label>
        <br/>
        {{#errorMessage}}
          <span class="error">{{errorMessage}}</span><br/>
        {{/errorMessage}}
          
        {{/isSearch}}
      {{/fields}}
      
      <input name="submit" type="submit" value="search" class="control">

      {{#isSearchResults}}
        <h2>Search Results</h2> 
        {{#searchResults}}
          <p class="result">
          <a class="doc-name" href={{{href}}}> {{doc_name}} </a>
          
          {{#lines}}
            <br> {{{.}}}
          {{/lines}}
           
          <br>
          
        {{/searchResults}}
      {{/isSearchResults}}
      
      </form> 
    {{>footer}}
  </body>
</html>
