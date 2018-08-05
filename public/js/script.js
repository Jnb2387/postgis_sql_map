(function() {
  "use strict";

  mapboxgl.accessToken =
    "pk.eyJ1Ijoiam5iMjM4NyIsImEiOiJjamZ4MWM3MmYwdnRlMzNuMTdybjNiMGZkIn0.XNRMd-IS-iN1yiSPaOY-Cg";
  var map = new mapboxgl.Map({
    container: "map", // container id
    style:"mapbox://styles/mapbox/satellite-streets-v9",
    // style: "mapbox://styles/mapbox/dark-v9", // stylesheet location
    center: [-104.9, 39.8], // starting position [lng, lat]
    zoom: 9, // starting zoom
    hash:true
  });
  map.addControl(new mapboxgl.NavigationControl());

  // //initialize a leaflet map
  // var map = L.map('map')
  //   .setView([40.708816,-74.008799], 11);

  //layer will be where we store the L.geoJSON we'll be drawing on the map
  var layer;

  var sql;

  //add CartoDB 'dark matter' basemap
  //   L.tileLayer('http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
  // attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://cartodb.com/attributions">CartoDB</a>'
  //   }).addTo(map);

  var queryHistory = localStorage.history
    ? JSON.parse(localStorage.history)
    : [];
  var historyIndex = queryHistory.length;
  updateHistoryButtons();

  //listen for submit of new query
  $("#run").click(function() {
	
    submitQuery();
  });

  function submitQuery() {

    $("#notifications").hide();
    $("#download").hide();
    $("#run").addClass("active");

    clearTable();

    sql = editor.getDoc().getValue();

    addToHistory(sql);

    //pass the query to the sql api endpoint
    $.getJSON("/sql?q=" + encodeURIComponent(sql), function(data) {
      //clear the map
      
      $("#run").removeClass("active");
      $("#notifications").show();
      $("#download").show();
      if (data.error !== undefined) {
        //write the error in the sidebar
        $("#notifications")
          .removeClass()
          .addClass("alert alert-danger");
        $("#notifications").text(data.error);
      } else if (data.objects.output.geometries.length == 0) {
        $("#notifications")
          .removeClass()
          .addClass("alert alert-warning");
        $("#notifications").text("Your query returned no features.");
      } else {
        //convert topojson coming over the wire to geojson using mapbox omnivore
        var features = omnivore.topojson.parse(data); //should this return a featureCollection?  Right now it's just an array of features.
        var featureCount = data.objects.output.geometries.length;
        var geoFeatures = features.filter(function(feature) {
          return feature.geometry;
        });
        $("#notifications")
          .removeClass()
          .addClass("alert alert-success");
        if (geoFeatures.length) {

          layer = geoFeatures[0].geometry.type;

		
          addLayer(geoFeatures); //draw the map layer
          $("#notifications").text(featureCount + " features returned.");
        } else {
          // There is no map to display, so switch to the data view
          $("#notifications").html(
            featureCount +
              ' features returned.<br/>No geometries returned, see the <a href="#" class="data-view">data view</a> for results.'
          );
          //toggle map and data view
          $("a.data-view").click(function() {
            $("#map").hide();
            $("#table").show();
          });
        }
        buildTable(features); //build the table
      }
    });
  }

  //toggle map and data view
  $(".btn-group button").click(function(e) {
    $(this)
      .addClass("active")
      .siblings()
      .removeClass("active");

    var view = $(this)[0].innerText;

    if (view == "Data View") {
      $("#map").hide();
      $("#table").show();
    } else {
      $("#map").show();
      $("#table").hide();
    }
  });

  //forward and backward buttons for query history
  $("#history-previous").click(function() {
    historyIndex--;
    updateSQL(queryHistory[historyIndex]);
    updateHistoryButtons();
  });

  $("#history-next").click(function() {
    historyIndex++;
    updateSQL(queryHistory[historyIndex]);
    updateHistoryButtons();
  });

  $("#geojson").click(function() {
    var url = "/sql?q=" + encodeURIComponent(sql) + "&format=geojson";
    window.open(url, "_blank");
  });

  $("#csv").click(function() {
    var url = "/sql?q=" + encodeURIComponent(sql) + "&format=csv";
    window.open(url, "_blank");
  });

  // initialize keyboard shortcut for submit
  $(window).keydown(function(e) {
    if (e.metaKey && e.keyCode == 83) {
      // crtl/cmd+S for submit
      e.preventDefault();
      submitQuery();
      return false;
    }
  });

  function propertiesTable(properties) {
    if (!properties) {
      properties = {};
    }

    var table = $("<table><tr><th>Column</th><th>Value</th></tr></table>");
    var keys = Object.keys(properties);
    var banProperties = ["geom"];
    for (var k = 0; k < keys.length; k++) {
      if (banProperties.indexOf(keys[k]) === -1) {
        var row = $("<tr></tr>");
        row.append($("<td></td>").text(keys[k]));
        row.append($("<td id='properties'></td>").text(properties[keys[k]]));
        table.append(row);
      }
    }
    return '<table border="1">' + table.html() + "</table>";
  }

  function addLayer(features) {
    console.log(layer);
    if(map.getSource(layer)){
        map.removeLayer(layer);
        map.removeSource(layer);
      }
    var geofeatures = {
      type: "FeatureCollection",
      features: features
    };
    map.addSource(layer, {
      type: "geojson",
      data: geofeatures
    });
    switch (layer) {
      case "Point":
        map.addLayer({
          id: layer,
          type: "circle",
          source: layer,
          paint: 
            {
              "circle-radius": [
                  "interpolate", ["linear"], ["zoom"],
                  // zoom is 5 (or less) -> circle radius will be 4px
                  5, 4,
                  // zoom is 10 (or greater) -> circle radius will be 8px
                  10,8
              ],
            "circle-color": "steelblue",
            "circle-stroke-color": "white",
            "circle-stroke-width": 1
          },
          filter: ["==", "$type", "Point"]
        },"road-label-large");
        break;
      case "MultiPolygon":
      case "Polygon":
     
        map.addLayer({
          id: layer,
          type: "fill",
          source: layer,
          paint: {
            "fill-color": "steelblue",
            "fill-opacity": 0.7,
            "fill-outline-color": "white"
          }
        },"road-label-large");
        break;
      case "MultiLineString":
      case "LineString":

        map.addLayer({
          id: layer,
          type: "line",
          source: layer,
          paint: {
            "line-color": "steelblue",
            "line-width":[
              "interpolate", ["linear"], ["zoom"],
              // zoom is 5 (or less) ->line width will be 1px
              5, 1,
              // zoom is 16 (or greater) -> line width will be 8px
              16,8
            ],
            // "line-blur": 1 
          }
        },"road-label-large");
        break;
      default:
        console.log("Errpr with layer type, i.e. Polygon, MultiPolygon");
    }

    // When a click event occurs on a feature in the places layer, open a popup at the
    // location of the feature, with description HTML from its properties.
    map.on("click", function(e) {
      var features = map.queryRenderedFeatures(e.point);
      console.log(features)
      var properties = features[0].properties;
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(propertiesTable(properties))
        .addTo(map);
    });

    // Change the cursor to a pointer when the mouse is over the places layer.
    map.on("mouseenter", layer, function() {
      map.getCanvas().style.cursor = "pointer";
    });

    // Change it back to a pointer when it leaves.
    map.on("mouseleave", layer, function() {
      map.getCanvas().style.cursor = "";
    });

    //       onEachFeature: function ( feature, layer ) {
    //         if (feature.geometry.type !== 'Point') {
    //           layer.bindPopup(propertiesTable(feature.properties));
    //         }
    //       },

    var bounds = turf.bbox(geofeatures);
    map.fitBounds(bounds, { padding: 20 });
  }

  function buildTable(features) {
    //assemble a table from the geojson properties

    //first build the header row
    var fields = Object.keys(features[0].properties);

    $("#table")
      .find("thead")
      .append("<tr/>");
    $("#table")
      .find("tfoot")
      .append("<tr/>");

    fields.forEach(function(field) {
      $("#table")
        .find("thead")
        .find("tr")
        .append("<th>" + field + "</th>");
      $("#table")
        .find("tfoot")
        .find("tr")
        .append("<th>" + field + "</th>");
    });

    features.forEach(function(feature) {
      //create tr with tds in memory
      var $tr = $("<tr/>");

      fields.forEach(function(field) {
        $tr.append("<td>" + feature.properties[field] + "</td>");
      });

      $("#table")
        .find("tbody")
        .append($tr);
    });

    $("#table>table").DataTable();
  }

  function clearTable() {
    $("#table")
      .find("thead")
      .empty();
    $("#table")
      .find("tfoot")
      .empty();
    $("#table")
      .find("tbody")
      .empty();
  }

  function addToHistory(sql) {
    //only store the last 25 queries
    if (queryHistory.length > 25) {
      queryHistory.shift();
    }

    queryHistory.push(sql);
    localStorage.history = JSON.stringify(queryHistory);
    historyIndex++;
    updateHistoryButtons();
  }

  function updateSQL(sql) {
    editor.setValue(sql);
  }

  //enable and disable history buttons based on length of queryHistory and historyIndex
  function updateHistoryButtons() {
    if (historyIndex > queryHistory.length - 2) {
      $("#history-next").addClass("disabled");
    } else {
      $("#history-next").removeClass("disabled");
    }

    if (queryHistory[historyIndex - 1]) {
      $("#history-previous").removeClass("disabled");
    } else {
      $("#history-previous").addClass("disabled");
    }
  }





//CHANGE A LAYERS COLOUR hehe
var colorbtn = document.querySelector('#colorbtn');


colorbtn.addEventListener('click', function(){
  var x = document.querySelector('.map-overlay');
  x.style.display = x.style.display === "block" ?  "none":"block";
});
var swatches = document.getElementById('swatches');
var layers = document.getElementById('layer');
var colors = [
    '#ffffcc',
    '#a1dab4',
    '#41b6c4',
    '#2c7fb8',
    '#253494',
    '#fed976',
    '#feb24c',
    '#fd8d3c',
    '#f03b20',
    '#bd0026'
];

colors.forEach(function(color) {
    var swatch = document.createElement('button');
    swatch.style.backgroundColor = color;
    swatch.addEventListener('click', function() {
        map.setPaintProperty(layers.value, layers.value+'-color', color);
    });
    swatches.appendChild(swatch);
//END change color

  });








  
})();

//Load codemirror for syntax highlighting
window.onload = function() {
  window.editor = CodeMirror.fromTextArea(document.getElementById("sqlPane"), {
    mode: "text/x-pgsql",
    indentWithTabs: true,
    smartIndent: true,
    lineNumbers: false,
    matchBrackets: true,
    autofocus: true,
    lineWrapping: true,
    theme: "monokai"
  });
  editor.replaceRange("\n", { line: 2, ch: 0 }); // create newline for editing
  editor.setCursor(2, 0);
};
