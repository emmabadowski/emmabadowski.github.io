---
---
'use strict';

//place for storing global data
const global = {};

const getTableData = function(node){
    return node.getElementsByClassName(['data'])[0].innerHTML;
};

$(document).ready(function(){

// Get the generated search_data.json file so lunr.js can search it locally.
    global.data = $.getJSON('/search_data.json');
// JEKYLL CODE - Get the generated list of pdfs that exist so that the program won't generate pdf links that don't resolve.
    {% assign pdf_files = site.static_files | where: "pdf", true %}
    global.filemap = [{% for pdf in pdf_files %}"{{ pdf.path }}"{% unless forloop.last %},{% endunless %}{% endfor %}];

//Semantic UI interactive elements
    $('.ui.accordion').accordion();

// Build lunr index when data has loaded
    global.data.then(function(loaded_data){
        global.idx = lunr(function(){
            this.ref('id');
            const here = this;
            for (let i in window.store){
                //index all fields, so that a search for all fields will still make an attempt to match;
                here.field(window.store[i]['value']);
            }
            $.each(loaded_data, function(index, value){
                here.add($.extend({"id":index},value));
            });
        });
        //after loading index, execute search based on query params
        //get params
        const params = new URLSearchParams(window.location.search);
        let uniqueFields = new Set();
        //get unique fields from params
        for (const key of params.keys() ){
            uniqueFields.add(key);
        }

        //get list of valid fields from DOM
        let validFields = new Set();
        for (const key of window.store){
            validFields.add(key.value);
        }

        //get set of all valid fields that are also unique params
        const validUniqueFields = new Set(
            [...uniqueFields].filter(x => validFields.has(x))
        );

        generate_param_labels(params, validUniqueFields);

        let allResults = []; //array for holding every result from all queries
        //search logic:
        // - for each unique param entry, perform a search
        validUniqueFields.forEach(function(field){
            //return a list of all search results.
            const results = execute_query(global.idx, field, params, loaded_data);
            results.forEach(function(result){
                allResults.push(result);
            });
        });

        let incResults = []; //array for holding results that should be displayed;
        // if there are params
        if (validUniqueFields.size){
            // - create set of only results that appear in all searches
            // - use the following function to get object containing counts of each result.ref item
            const resultFrequency = allResults.reduce(function(obj,b) {
                obj[b] = ++ obj[b] || 1;
                return obj;
            }, {});

            // - compare returned counts against number of query params; only return results that appear as many times as there are params
            for (const key in resultFrequency){
                if (!resultFrequency.hasOwnProperty(key)){continue;}
                if (resultFrequency[key] >= validUniqueFields.size){
                    incResults.push(key);
                }
            }
            // - forward set to display_search_results
            display_search_results(incResults, loaded_data);
        } else { //if there are no params, display everything.
            const results = global.idx.search('');
            results.forEach(function(result){
                incResults.push(result.ref);
            });
            display_search_results(incResults, loaded_data);
        }

    });

// Event when the form is submitted
    $("#search_form").submit(function(event){
        event.preventDefault();
        let params = new URLSearchParams(window.location.search); //call up existing search params
        const field = $("#search_field").val();  //value of search_field
        const type = $("#search_type").val();
        const queries = $("#search_text").val().trim().replace(', ',' ').replace(' OR ',' ').replace(' AND ',' ').split(' '); // value of search_text, split into separate terms by spaces
        for (const query of queries){
            if (type === 'or'){
                params.append(field,encodeURI(query)); //build query param based on search field value; encodeURI escapes any html entered in field
            } else if (type === 'and'){
                params.append(field,'+'+encodeURI(query));
            } else if (type === 'not'){
                params.append(field,'-'+encodeURI(query));
            }
        }
        window.location.search = params; //pass param to URL, triggering page reload.
    });

//disable OR/AND/NOT field for numbers, because it doesn't make sense.
    $("#search_field").on("change", function(){
        const field = $("#search_field").val();
        const type = (window.store.find(item => item.value === field)) ? window.store.find(item => item.value === field).type : '';
        $("#search_type").prop('disabled', (type === 'num'  || type === 'sym'));
    });



});

function display_search_results(results, loaded_data) {

    // Are there any results?
    if (results.length) {
        const $search_results = $("#search_results");
        $search_results.empty();  //remove spinner
        // Iterate over the results, building a table row for each one
        for (const result of results) {
            const item = loaded_data[result];
            let row = '<tr>';
            // Build a snippet of HTML for this result
            for (let i in window.store){
                const key = window.store[i]['value'];
                const label = window.store[i]['label'];
                row += `<td><span class="mobile only"><strong>${label}:</strong></span><span class="data">${item[key]}</span>${get_pdf_link(key, item, global.filemap)}</td>`;
            }
            row += '</tr>';
            // Add the row to the collection of results.
            $search_results.append(row);
        }
    } else {
        const $search_window = $("#search_window");
        // If there are no results, let the user know.
        $search_window.html('<p><strong>No search results found</strong></p>');
    }
    //once table is generated, allow sorting
    $('table').tablesorter(
        {
            cssAsc: "ascending",
            cssDesc: "descending",
            sortList: [[0,0],[3,0]],
            sortAppend: [[0,0],[3,0]],
            textExtraction: getTableData,
            headerTemplate: '',
            widgets: ["columns"],
            widgetOptions: {
                columns: ['sorted', 'secondary']
            },
            headers: {
                0: {
                    sorter: 'ignoreArticles',
                    ignoreArticles: ['en', 'fr', 'it'],
                    ignoreArticlesExcept: ''
                }
            }
        }
    );
}

function generate_param_labels(params, validUniqueFields){
    const $param_labels = $("#param_labels");
    validUniqueFields.forEach(function(field){
        const f = window.store.find(item => item.value === field);
        const prefix = (f) ? f.label+':' : 'All Fields:';
        let query = [];
        if (f && f.type === 'num') {
            query = params.getAll(field);
        } else {
            for (const i of params.getAll(field)){
                if (i.startsWith('+')){
                    query.push('AND '+i.slice(1));
                } else if (i.startsWith('-')){
                    query.push('NOT '+i.slice(1));
                } else {
                    query.push(i);
                }
            }
        }
        query = query.join(', ');
        //syntax based on SemanticUI labels
        $param_labels.append(`
        <div class="ui large label">${prefix}
            <div class="detail">${query}</div>
            <i class="delete icon" onclick="delete_param('${field}')"></i>
        </div>
        `);
    });
    //button for removing all params at once
    if (validUniqueFields.size){
        $param_labels.append(`<a href='/'>Clear all</a>`);
    }
}

function execute_query(index, field, params, data){
    //needs to return an array of search result song_paths.
    const f = (field === 'q') ? {'type':'all'} : window.store.find(item => item.value === field);
    if (f.type === 'text' || f.type === 'all'){ //perform idx search
        const prefix = (f.type === 'all') ? '' : field+':';
        let query = [];
        for (const i of params.getAll(field)){
            if (i.startsWith('+')){
                query.push('+'+prefix+i.slice(1));
            } else if (i.startsWith('-')){
                query.push('-'+prefix+i.slice(1));
            } else {
                query.push(prefix+i);
            }
        }
        query = query.join(' ');
        //ensure each match is only being returned once by passing through a Set
        return Array.from(new Set(index.search(query).map(a => a.ref))); //return array of matching results
    } else if (f.type === 'num') { //perform number range search
        const entries = Object.entries(data).map(i => ([i[0], i[1][field]]));
        let res = [];
        params.getAll(field).forEach(function(n){
            //if n starts with >
            if (n.startsWith('>=')){
                res.push (...entries.filter(i => i[1] >= n.slice(1)).map(a => a[0]));
            } else if (n.startsWith('<=')) {
                res.push (...entries.filter(i => i[1] <= n.slice(1)).map(a => a[0]));
            } else if (n.startsWith('>')) {
                res.push (...entries.filter(i => i[1] > n.slice(1)).map(a => a[0]));
            } else if (n.startsWith('<')) {
                res.push (...entries.filter(i => i[1] < n.slice(1)).map(a => a[0]));
            } else if (n.includes('-')) {
                const [n1, n2] = n.split('-');
                res.push (...entries.filter(i => (i[1] >= n1 && i[1] <= n2)).map(a => a[0]));
            } else {
                res.push (...entries.filter(i => i[1] === n).map(a => a[0]));
            }
        });
        //ensure that each match is only being returned once by passing through a Set
        return Array.from(new Set(res));
    } else if (f.type === 'sym') { //perform direct string comparisons
        const entries = Object.entries(data).map(i => ([i[0], i[1][field].toLowerCase()]));
        let res = [];
        params.getAll(field).forEach(function(s){
            res.push(...entries.filter(i=>i[1].includes(s.toLowerCase())).map(a => a[0]));
        });
        return Array.from(new Set(res));
    }

}

//deletes a param when you click the X icon on the label
function delete_param(field){
    const params = new URLSearchParams(window.location.search);
    params.delete(field);
    window.location.search = params;
}

//adds a link to the pdf file to the book and song title fields.
function get_pdf_link(field, data, filemap){
    let path = 'not found'; //arbitrary value that definitely wont be a valid path
    //if displaying a book or song title, put together an appropriate path
    if (field === 'book_title'){
        path = `/pdfs/books/${data.book_path}.pdf`;
    } else if (field === 'song_title'){
        path = path = `/pdfs/songs/${data.book_path}/${data.song_path}.pdf`;
    }
    //if the file exists, provide a link.
    if (filemap.includes(path)){
        return `<a href="${path}"><i class="file pdf outline icon"></i></a>`;
    } else {
        return '';
    }
}


