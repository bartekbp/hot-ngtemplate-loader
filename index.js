var loaderUtils = require("loader-utils");
var path = require('path');
var jsesc = require('jsesc');

module.exports = function (content) {
  this.cacheable && this.cacheable();

  var options = loaderUtils.getOptions(this) || {};
  var ngModule = getAndInterpolateOption.call(this, 'module', 'ng'); // ng is the global angular module that does not need to explicitly required
  var relativeTo = getAndInterpolateOption.call(this, 'relativeTo', '');
  var prefix = getAndInterpolateOption.call(this, 'prefix', '');
  var requireAngular = !!options.requireAngular || false;
  var absolute = false;
  var pathSep = options.pathSep || '/';
  var resource = this.resource;
  var pathSepRegex = new RegExp(escapeRegExp(path.sep), 'g');
  var appElement = options.appElement || 'body';
  // component or route
  var reloadType = options.reloadType || 'component';

  // if a unix path starts with // we treat is as an absolute path e.g. //Users/wearymonkey
  // if we're on windows, then we ignore the / prefix as windows absolute paths are unique anyway e.g. C:\Users\wearymonkey
  if (relativeTo[0] === '/') {
    if (path.sep === '\\') { // we're on windows
      relativeTo = relativeTo.substring(1);
    } else if (relativeTo[1] === '/') {
      absolute = true;
      relativeTo = relativeTo.substring(1);
    }
  }

  // normalise the path separators
  if (path.sep !== pathSep) {
    relativeTo = relativeTo.replace(pathSepRegex, pathSep);
    prefix = prefix.replace(pathSepRegex, pathSep);
    resource = resource.replace(pathSepRegex, pathSep)
  }

  var relativeToIndex = resource.indexOf(relativeTo);
  if (relativeToIndex === -1 || (absolute && relativeToIndex !== 0)) {
    throw new Error('The path for file doesn\'t contain relativeTo param');
  }

  // a custom join of prefix using the custom path sep
  var filePath = [prefix, resource.slice(relativeToIndex + relativeTo.length)]
      .filter(Boolean)
      .join(pathSep)
      .replace(new RegExp(escapeRegExp(pathSep) + '+', 'g'), pathSep);
  var html;

  if (content.match(/^module\.exports/)) {
    var firstQuote = findQuote(content, false);
    var secondQuote = findQuote(content, true);
    html = content.substr(firstQuote, secondQuote - firstQuote + 1);
  } else {
    html = content;
  }

  return `var path = '${jsesc(filePath)}';
        var html = ${html};
        var angularRef = ${requireAngular ? "require('angular');\n" : "window.angular"};
        var defaultReload = function() {
          angularRef.module('${ngModule}').run(['$templateCache', function(c) { c.put(path, html) }]);
        };
        
        if(module.hot) {
            var appElement = document.querySelector('${appElement}');
            var ngElement = angularRef.element(appElement);
            var injector = ngElement.data() ? ngElement.data().$injector : null;
            if(injector) {
                var templateCache = injector.get('$templateCache');
                var templateInCache = templateCache.get(path);
                templateCache.put(path, html);
                
                if(templateInCache) {
                    console.log('Found template', path, 'in $templateCache, reloading route');
                    var parts = path.split('/');
                    var filenamePart = parts[parts.length - 1];
                    var filenameParts = filenamePart.split('.');
                    var elementName = filenameParts[0];
                    var componentName = elementName.replace(/-./g, function(text) { return text[1].toUpperCase()});                    
                    var element = angularRef.element(elementName);
                    
                    if('${reloadType}' === 'component' && element.length > 0) {
                      var $scope = element.scope();
                      var $childScope = $scope.$$childHead;
                      
                      var $timeout = injector.get('$timeout');
                      $timeout(function() { 
                          $childScope.$destroy();
                          var $compile = injector.get('$compile');
                          $compile(element)($scope); 
                      });
                    } else {
                      injector.get('$route').reload();
                    }
                }
            } else {
                defaultReload();
            }
            
            module.hot.accept();
        } else {
          defaultReload();
        }

        module.exports = path;`;

  function getAndInterpolateOption(optionKey, def) {
    return options[optionKey]
        ? loaderUtils.interpolateName(this, options[optionKey], {
          context: options.context,
          content: content,
          regExp: options[optionKey + 'RegExp'] || options['regExp']
        })
        : def
  }

  function findQuote(content, backwards) {
    var i = backwards ? content.length - 1 : 0;
    while (i >= 0 && i < content.length) {
      if (content[i] === '"' || content[i] === "'") {
        return i;
      }
      i += backwards ? -1 : 1;
    }
    return -1;
  }

  // source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Using_Special_Characters
  function escapeRegExp(string) {
    return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
  }
};
