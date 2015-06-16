// TODO:
// 1. auto-resizing graph, change the axis range
// 2. set axis range, set title
// 3. gmean
// 5. save graph
// 4. fix the offline plotter

// Some const
// if x axis is an element of timeParam, then the default behavior is to gmean everything
var timeParam = ['run', 'parsed_date'];
// create the actual plot in the display_canvas
//
var overlay_list = [];
// raw data means it is not processed by gmean, and its param name has not been manipulated.
// NOTE: we don't store the data of default plot (cuz they are not manipulated)
var raw_data = null;
var gmean_data = null;
var range = {'x': [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY], 
             'y': [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]};
var plotSize = {'width': 650, 'height': 500};
var plotMargin = {'left': 100, 'right': 40, 'top': 70, 'bottom': 70};
// a list of svg elements in d3 type: used for future plot manipulation
var chartList = [];
function plotter_setup(data) {
    if (data.status !== 'OK') {
        report_error(data.status);
        return;
    }
    // initialize
    raw_data = data;
    gmean_data = null;
    overlay_list = [];
    // check is x is run / parsed_date
    // if yes, then geomean on everything
    // if not, then supress on params that will generate the least subplots
    if (timeParam.indexOf(raw_data.params[0]) !== -1) {
        // geomean on everything. 
        defaultToTimeGmeanPlot();
        // possibly show the generate_overlay_selector as well
    } else {
        // choose the axis with the most distinct values and overlay on it
        generate_overlay_selector('raw');
    }
}
/*
 * generate the default plot if x axis is time
 * methodology: gmean over everything
 */
function defaultToTimeGmeanPlot() {
    // flattenedData = _.flatten(raw_data, true);
    for (var i = 0; i < raw_data.data.length; i++) {
        groupedX = _.groupBy(raw_data.data[i], function (dotSeries) {return dotSeries[0]} );
        seriesXY = [];
        for (k in groupedX) {
            // groupedX: eliminate all other irrelevant values
            groupedX[k] = _.map(groupedX[k], function (list) {return list[1];} );
            // count the number of tuples with the valid y value
            var validCount = 0;
            groupedX[k] = _.reduce( groupedX[k], 
                                    function (memo, num) {
                                        if (num > 0) {
                                            memo *= num;
                                            validCount += 1;
                                        }
                                        return memo;
                                    }, 
                                    1);
            // setup the gmean entry for groupedX
            groupedX[k] = (validCount > 0) ? Math.pow(groupedX[k], 1.0/validCount) : -1;
            // now {x1: y1, x2: y2, ...}
            // should convert it [[x1,y1],[x2,y2],...]
            seriesXY.push([k, groupedX[k], raw_data.tasks[i]]);
        }
        simple_plot(raw_data.params, seriesXY, []);
    }
}
/*
 * to generate the overlay selector panel
 * the plot will be generated after button is clicked.
 *  type is to used to decide whether to generate axes of raw data or gmean data
 */
function generate_overlay_selector(type) {
    var selector_div = d3.select('#overlay_select');
    // clear up
    selector_div.html('');
    var choice = null;
    if (type == 'raw') {
        choice = raw_data.params;
    } else {
        choice = gmean_data.params;
    }
    selector_div.append('h5').text('select overlay axis');
    var form = selector_div.append('form').attr("id", "overlay_options").attr('action', '').append("fieldset");
    form.append('legend').text('select overlay axes:');
    for (var i = 2; i < choice.length; i ++ ) {
        //var label = form.append('label').attr('class', 'param_label');
        form.append('input').attr('type', 'checkbox').attr('value', choice[i]).attr('index', i-2);
        form.append('label').text(choice[i]).append('br');
    }
    form.append('button').attr('type', 'button').attr('id', 'overlay_submission').text('Get Plot!');
    $('#overlay_submission').click(function () {overlay_list = [];
                                                var checkbox = form.selectAll('input', '[type="checkbox"]');
                                                checkbox.each(function () {
                                                                           if (d3.select(this).property('checked')) {
                                                                               overlay_list.push(d3.select(this).attr('index'));
                                                                           }
                                                                         });
                                                plot_generator(type);} );
}




function plot_generator(type) {
    // clear up
    d3.select('#chart').html('');
    var series = raw_data.data;
    // filter is an array of array: filter[i][*] stores all possible values of axis i
    // TODO: I am actually not using filter. 
    var filter = [];
    for (var t = 0; t < raw_data.tasks.length; t++) {
        for (var i = 0; i < raw_data.params.length - 2; i++) {
            var temp = new Set();
            for (var j = 0; j < raw_data.data[t].length; j++) {
                temp.add(raw_data.data[t][j][i+2]);
            }
            var filt_name = [];
            // convert set to list
            for (v of temp) {
                filt_name.push(v);
            }
            filter.push(filt_name);
            console.log("filt_name: " + raw_data.params[i+2]);
            console.log("filt_temp " + filt_name);
        }
    }
    // traverse all tasks
    for (var i = 0; i < series.length; i++) {
        var grouped_series = data_transform(series[i], overlay_list, 'non-overlay');
        console.log(">>>>>");
        console.log(overlay_list);
        console.log(grouped_series);
        range['x'] = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
        range['y'] = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
        findAxisScale(grouped_series);
        for (var k in grouped_series) {
            simple_plot(raw_data.params, grouped_series[k], overlay_list);
        }
    }
}
function findAxisScale(series) {
    for (var k in series) {
        for (var i = 0; i < series[k].length; i++) {
            range['x'][0] = (range['x'][0] > series[k][i][0]) ? series[k][i][0] : range['x'][0];
            range['x'][1] = (range['x'][1] < series[k][i][0]) ? series[k][i][0] : range['x'][1];
            range['y'][0] = (range['y'][0] > series[k][i][1]) ? series[k][i][1] : range['y'][0];
            range['y'][1] = (range['y'][1] < series[k][i][1]) ? series[k][i][1] : range['y'][1];
        }
    }
}

/*
 * Utility function, called by plot_generator()
 * actually generating plot by calling d3 function
 * params: raw_data.params
 * series: in the format of list of list (list of tuples)
 * overlay_list: a list of index(int)
 */
function simple_plot(params, series, overlay_list) {
    // setup plot name
    var plot_name = "";
    for (var i = 2; i < series[0].length; i ++){
        if ($.inArray(i-2+'', overlay_list) == -1) {
            plot_name += series[0][i];
            plot_name += '  ';
        }
    }
    // setup raw_data lines
    var lineData = data_transform(series, overlay_list, 'overlay');
    var lineInfo = [];
    for (k in lineData) {
        var lineVal = [];
        for (var j = 0; j < lineData[k].length; j ++ ){
            lineVal.push({x: lineData[k][j][0], y: lineData[k][j][1]});
        }
        lineVal = _.sortBy(lineVal, 'x');
        lineInfo.push({values: lineVal, key: k});
    }
    nv.addGraph(function() {
       var chart = nv.models.lineChart()
                            .margin(plotMargin) 
                            .useInteractiveGuideline(true)
                            .showLegend(true)
                            .showYAxis(true)
                            .showXAxis(true);
        chart.forceX(range['x']);
        chart.forceY(range['y']);
        chartList.push(chart);
        chart.xAxis.axisLabel(params[0])
                   .tickFormat(d3.format(',r'));
        chart.yAxis.axisLabel(params[1])
                   .tickFormat(d3.format('.02f'));
        chart.legend.margin({top:30});
        var svg = d3.select('#chart')
                    .append('svg').attr('id', plot_name)
                    .attr('height', plotSize['height']).attr('width', plotSize['width']);
        /*
        var $svg = $(document.getElementById(plot_name));
        $svg.parent().append('<div class="chart-title">' + plot_name + '</div>');
        */
        //$(svg).parent().append('<div class="chart-title">' + plot_name + '</div>');
        svg.append("text")
           .attr("x", plotSize['width']/2)
           .attr("y", 20)
           .attr("text-anchor", "middle")
           .attr("class", "chart-title")
           .style("font-size", "16px")
           .text(plot_name);
        svg.datum(lineInfo).call(chart);
        nv.utils.windowResize(function() { chart.update(); } );
    });
}

// we can choose a slightly more neat method: first group by all the axes
// that is not overlaid, then do legend plot upon every group. this will
// not require any recursive function.

function data_transform (series, overlay_list, mode) {
    // group by
    if (mode == 'non-overlay') {
        return _.groupBy(series, function (dot_info) {  axis_group = "";
                                                        for (var i = 2; i < dot_info.length; i++) {
                                                            if ($.inArray(i-2+"", overlay_list) == -1){
                                                                axis_group += dot_info[i];
                                                            } 
                                                        }   
                                                        return axis_group;
                                                     } );
    } else {
        return _.groupBy(series, function (dot_info) {  axis_group = "";
                                                        for (var i = 2; i < dot_info.length; i++) {
                                                            if ($.inArray(i-2+"", overlay_list) > -1){
                                                                axis_group += dot_info[i];
                                                            } 
                                                        }   
                                                        return axis_group;
                                                     } );
    }
}


