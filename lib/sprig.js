(function (window, undefined) {

  // DOM4 MutationObserver http://dom.spec.whatwg.org/#mutation-observers
  var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;

  var
      debug = false,
      Sprig,
      $ = window.jQuery
          || (typeof require == 'function' && require("jquery"))
          || (function () {
        throw "Sprig requires jQuery";
      })(),
      log = function () {
        if (!debug) {
          return log = function () { }; // Silence the log
        }
        console.log.apply(console, arguments);
      },
      camel2data = function (camelStr) {
        return camelStr.replace(/([A-Z]){1}/g, function (s) {
          return "-" + s.toLowerCase()
        })
      },
      // Use a wrapper around the dataset instead of jquery because we need the dataset to be in sync with data-* attributes
      // Only for compatibility reasons
      $D = function (el) {
        if (!el.__sprigDataAccessor__) {

          if (el.dataset) {
            el.__sprigDataAccessor__ = {
              "set": function (key, val) {
                el.dataset[key] = val;
              },
              "get": function (key) {
                return key ? el.dataset[key] : el.dataset;
              }
            }
          }
          else {
            el.__sprigDataAccessor__ = (function () {
              var dataset = $.extend({}, $(el).data());
              return {
                "set": function (key, val) {
                  dataset[key] = val;
                  el.setAttribute("data-"+camel2data(key), val);
                },
                "get": function (key) {
                  return key ? dataset[key] : dataset;
                }
              }
            }());
          }
        }
        return el.__sprigDataAccessor__;
      };

  // --- UTILS
  function hasComponent(el) {
    return $D(el).get().sprigComponent
  }

  function isLoading(el) {
    return $D(el).get().sprigReadyState == 'loading'
  }

  function isLoaded(el) {
    return $D(el).get().sprigReadyState == 'loaded'
  }

  function isScheduled(el) {
    return $D(el).get().sprigReadyState == 'scheduled'
  }

  // Either loaded or in the process of loading
  function isInitialized(el) {
    return isLoaded(el) || isLoading(el);
  }

  // Either loaded or in the process of loading
  function inProgress(el) {
    return isScheduled(el) || isLoading(el) || isLoaded(el);
  }

  function isDeferred(el) {
    return $D(el).get().sprigDefer
  }

  Sprig = (function () {

    function Sprig() {
      this.components = {};
      this.pending = {};

      if (MutationObserver) {
        var self = this;
        var observer = new MutationObserver(function (mutations) {
          for (var i = 0, i_len = mutations.length; i < i_len; i++) {
            (function (addedNodes) {
              for (var j = 0; j < addedNodes.length; j++) {
                log("DOM mutated, now setup: ", addedNodes[j]);
                self.load(addedNodes[j])
              }
            }(mutations[i].addedNodes));
          }
        });
        observer.observe(document, { childList: true, subtree: true });
      }
    }

    Sprig.prototype.finalize = function (el) {
      $D(el).set("sprigReadyState", "loaded");
      this.load(el);
    };

    Sprig.prototype.add = function (componentId, setupFunc) {
      if (this.components[componentId]) {
        return console.warn('Component "' + componentId + '" already registered. Skipping.');
      }

      this.components[componentId] = {
        instances: [],
        setupFunc: setupFunc
      };

      if (this.pending[componentId]) {
        var todo = this.pending[componentId].slice();
        delete this.pending[componentId];
        var el;
        while (el = todo.shift()) {
          log("Now ready to setup " + componentId + " for ", el);
          this.setup(el);
        }
      }
    };

    // Setup a component for a single element
    Sprig.prototype.setup = function (el) {

      var componentId = $D(el).get().sprigComponent;

      var component = this.components[componentId];
      if (!component) {
        // defer initialization until component is added
        log('Component "' + componentId + '" not registered yet, so defer setup for', el);
        this.pending[componentId] || (this.pending[componentId] = []);
        this.pending[componentId].push(el);
        return
      }

      log("Setup component for", el);
      $D(el).set("sprigReadyState", "loading");

      var instance = null;

      for (var i = 0, len = component.instances.length; i < len; i++) {
        if (component.instances[i].el == el) {
          instance = component.instances[i];
          break;
        }
      }

      if (instance) {
        // We are reloading, reset attributes
        log("reloading, original attrs:", JSON.stringify(instance.originalAttrs))
        $.extend($D(el).get(), instance.originalAttrs);
        log($D(el).get())
      }
      else {
        instance = {
          el:el,
          originalAttrs:$.extend({}, $(el).data())
        };
        component.instances.push(instance);
      }

      var setupFunc = component.setupFunc;

      var async = setupFunc.length == 3;

      var data = $D(el).get();

      var self = this;
      var elementArg = Sprig.unwrapElement ? el : $(el);
      if (async) {
        setupFunc(elementArg, data, function () {
          self.finalize(el);
        });
      }
      else {
        setupFunc(elementArg, data);
        self.finalize(el);
      }
    };

    // Look for elements that is not already loaded, or currently loading
    Sprig.prototype.load = function ($el) {
      $el = $el ? $($el) : $('body');
      var el = $el[0];
      if (hasComponent(el) && !inProgress(el)) {
        this.setup(el);
      }
      var $pending = $('[data-sprig-component]:not([data-sprig-ready-state=loaded]):not([data-sprig-ready-state=loading]):not([data-sprig-ready-state=scheduled])', el);
      log("Load " + $pending.length + " components in", el);
      var self = this;
      $pending.each(function (i, el) {
        $D(el).set("sprigReadyState", "scheduled");
      });
      $pending.each(function (i, el) {
        self.setup(el);
      });
    };

    // Look for elements that is already loaded, and force-reload them
    Sprig.prototype.reload = function (root) {
      if (hasComponent(root) && isInitialized(root)) {
        this.setup($(root)[0]);
      }
      log("Load component inside", root);
      var $loaded = $("[data-sprig-ready-state=loaded]", root);
      log("Reload " + $loaded.length + " components in", root || 'body');
      var self = this;
      $loaded.each(function (i, el) {
        self.setup(el);
      });
    };

    var global = new Sprig();
    $.extend(Sprig, global);

    Sprig.unwrapElement = false;

    return Sprig;

  })();

  // Setup mutation observers

  if (typeof exports !== 'undefined') {
    // Export as CommonJS module...    
    module.exports = Sprig;
  }
  else {
    // ... or add to to the global object as Sprig
    window.Sprig = Sprig;
  }
}(typeof window != 'undefined' ? window : this));