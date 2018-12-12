<!DOCTYPE html>
<html>
  <head>
    <title>Add Document</title>
    <link rel="stylesheet" href="{{{base}}}/css/style.css">
  </head>
  <body>
    <h1>Add Document</h1>
    <ul>
      {{#errors}}
        <li class="error">{{.}}</li>
      {{/errors}}
    </ul>
    <form action="{{{base}}}/add" method="POST" enctype="multipart/form-data">
	{{#fields}}
    {{#isId}}
        <label>
        <span class="label">{{friendlyName}}:</span>
        <input id="{{id}}" name="{{name}}" type="{{type}}">
        </label>
        <br/>
        {{#errorMessage}}
          <span class="error">{{errorMessage}}</span><br/>
        {{/errorMessage}}
    {{/isId}}
	{{/fields}}
      <input id="submit" name="submit" type="submit" value="add" class="control">
    </form> 
    {{>footer}}
  </body>
</html>
