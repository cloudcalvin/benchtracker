#!/usr/bin/python
# web service, so return only JSON (no HTML)
from flask import Flask, jsonify, request, url_for, make_response, render_template
import sqlite3
import interface_db as d
import urlparse
import functools    # need to wrap own decorators to comply with flask views

app = Flask(__name__)

def catch_operation_errors(func):
    @functools.wraps(func)
    def task_checker(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except IndexError:
            return jsonify({'status': 'Index out of bounds! (likely table index)'})
        except sqlite3.OperationalError as e:
            return jsonify({'status': 'Malformed request! ({})'.format(e)})
    return task_checker

# each URI should be a noun since it is a resource (vs a verb for most library functions)

@app.route('/')
@app.route('/tasks', methods=['GET'])
def get_tasks():
    return jsonify({'tasks':d.list_tasks()})

@app.route('/param', methods=['GET'])
@catch_operation_errors
def get_param_desc():
    tasks = parse_tasks()
    param = request.args.get('p')
    mode = request.args.get('m', 'range')   # by default give ranges, overriden if param is text
    try:
        (param_type, param_val) = d.describe_param(param, mode, tasks)
    except ValueError:
        return jsonify({'status': 'Unsupported type mode! ({})'.format(mode)})
    return jsonify({'status': 'OK', 
    'tasks':tasks, 
    'param': param,
    'type': param_type,
    'val': param_val})

@app.route('/tasks/', methods=['GET'])
@catch_operation_errors
def get_shared_params():
    tasks = parse_tasks()
    params = d.describe_tasks(tasks)
    return jsonify({'status': 'OK', 'tasks':tasks, 'params': params})

@app.route('/data', methods=['GET'])
@catch_operation_errors
def get_filtered_data():
    x_param = request.args.get('x')
    y_param = request.args.get('y') 

    if not x_param:
        return jsonify({'status': 'Missing x parameter!'}) 
    if not y_param:
        return jsonify({'status': 'Missing y parameter!'}) 

    try:
        (filtered_params, filters) = parse_filters()
    except IndexError:
        return jsonify({'status': 'Incomplete filter arguments!'})
    except ValueError:
        return jsonify({'status': 'Unsupported filter method!'})

    task = parse_tasks()
    if isinstance(task, list):
        return jsonify({'status': 'Only 1 task can be specified!'})

    data = d.retrieve_data(x_param, y_param, filters, task)
    data = [tuple(row) for row in data]
    params = [x_param.split()[0], y_param.split()[0]]
    filtered_params = [p for p in filtered_params if p != x_param and p != y_param]
    params.extend(filtered_params)
    return jsonify({'status': 'OK', 'task':task, 'params':params, 'data':data})

@app.route('/view')
def get_view():
    tasks = {task_name: task_context for (task_name, task_context) in [t.split('|',1) for t in d.list_tasks()]}
    return render_template('viewer.html',
                            tasks=tasks)

@app.errorhandler(404)
def not_found(error):
    return make_response(jsonify({'error': 'Not found'}), 404)


def parse_tasks():
    tasks = request.args.getlist('t')
    if tasks[0].isdigit():
        all_tasks = d.list_tasks()
        tasks = [all_tasks[int(t)] for t in tasks]
    return tasks[0] if len(tasks) == 1 else tasks

def parse_filters():
    filter_param = None
    filter_method = None
    filters = []
    filter_args = []
    filter_params = []
    for arg in urlparse.parse_qsl(request.query_string):
        if arg[0][0] != 'f':
            continue
        # new filter parameter
        if arg[0] == 'fp':
            # previous filter ready to be built
            if filter_param and filter_method and filter_args:
                filters.append(d.Task_filter(filter_param, filter_method, filter_args))
                filter_args = []    # clear arguments; important!
                print("{}: {}".format(filters[-1], filters[-1].args))
                filter_params.append(filter_param)
            filter_param = arg[1]

        if arg[0] == 'fm':
            filter_method = arg[1]
        if arg[0] == 'fa':
            filter_args.append(arg[1])
    # last filter to be added
    if (not filters or filter_param != filters[-1].param) and filter_args:
        filters.append(d.Task_filter(filter_param, filter_method, filter_args))
        print("{}: {}".format(filters[-1], filters[-1].args))
        filter_params.append(filter_param)

    return filter_params,filters


if __name__ == '__main__':
    app.run(debug=True)
