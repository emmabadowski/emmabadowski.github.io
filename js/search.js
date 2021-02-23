---
---
'use strict';

//place for storing global data
const global = {};
//initialize table sorter
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
// actions to perform once data has loaded
    global.data.then(function(loaded_data){
        //create param labels based on current params
           //needs to load before options are declared on search so that threshold value has been set
        const params = deserialize_params();
        generate_param_labels(params);
        //sets value on search threshold slider based on existing value or default
        $("#search_threshold").val(window.threshold);
        //execute search based on params
        const results = execute_query(loaded_data, params);
        //display search results
        display_search_results(results);
    });
// Event when the form is submitted
    $("#search_form").submit(function(event){
        event.preventDefault();
        let params = deserialize_params(); //call up existing search params
        const field = $("#search_field").val();  //value of search_field
        const text = $("#search_text").val();
        const type = get_field_by_value("type", field);
        //determines which query param should be updated based on data type
        const conversion = {all:'q', text:'a', num:'n', sym:'n'};
        const param = conversion[type];
        //updates appropriate param wth new field and text
        if (field === 'q'){
            //all fields get entered as raw text
            params[param] ? params[param].push(text) : params[param] = [text];
        } else {
            //everything else gets entered as a key value pair
            params[param] ? params[param].push({[field] : text}) : params[param] = [{[field] : text}];
        }

        serialize_params(params); //pass param to URL, triggering page reload.
    });
// Events when threshold slider is submitted or reset
    $("#search_t_form").submit(function(event){
        event.preventDefault();
        const t = parseFloat($("#search_threshold").val());
        serialize_params({t:t});
    });
    $("#search_t_form").on("reset", function(event){
        event.preventDefault();
        serialize_params({t:0.4});
    });
});
function display_search_results(results) {
    //Are there any results ?
    if (results.length){
        const $search_results = $("#search_results");
        $search_results.empty(); //remove spinner
        for (const result of results){
            let row = '<tr>';
            //build a snippet of HTML for this result
            for (let i in window.store){
                const key = window.store[i]['value'];
                const label = window.store[i]['label'];
                row += `<td><span class="mobile only"><strong>${label}:</strong></span><span class="data">${result[key]}</span>${get_pdf_link(key, result, global.filemap)}</td>`;
            }
            row += '</tr>';
            //add the row to the collection of results
            $search_results.append(row);
        }
    } else {
        const $search_window = $("#search_window");
        // If there are no results, let the user know.
        $search_window.html('<p><strong>No search results found</strong></p>');
    }
    //once table is generated, allow sorting via the JQuery TableSorter tool
    $('#search_table').tablesorter(
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
//run once after file loads to generate labels from search params
function generate_param_labels(params){
    const $param_labels = $("#param_labels");
    for (const category in params){
            for (const value in params[category]){
                create_param_label($param_labels, params, category, value);
            }
        }
    if (Object.keys(params).length){
        $param_labels.append(`<a href='/'>Clear all</a>`);
    }
}
//used by generate_param_labels to create each individual label
function create_param_label(id, params, category, value){
    const item = params[category][value];
    //gets fields value from item
    const v = (item === Object(item)) ? Object.keys(item)[0] : 'q';
    const label = get_field_by_value("label", v);
    const text = (item === Object(item)) ? Object.values(item)[0] : item; //gets value from object, keeps string the same
    id.append(`
        <div class="ui large label">${label}:
            <div class="detail">${text}</div>
            <i class="delete icon" onclick="delete_param('${category}','${value}')"></i>
        </div>
        `);
}
//utility function to get info about a given search field based on a provided value
function get_field_by_value(field, value){
    const result = window.store.filter( a => a.value === value);
    if (result.length){
        return result[0][field];
    } else {
        //if passed anything that isn't valid, assume it's an all fields search and respond accordingly
        return {label:"All fields", type:"all"}[field];
    }
}
//function that deletes a single param
function delete_param(category, value){
    let params = deserialize_params(); //invokes the deserialize function again to get params because objects can't be passed to this via HTML
    let newparams = params[category]; //look at only array of params of same type (q, a, or n)
    newparams.splice(value,1); //remove param to be deleted
    params[category] = newparams;
    serialize_params(params); //serialize params with changes
}
//gets query params and converts them into readable text
function deserialize_params(){
    const params = new URLSearchParams(window.location.search);
    const validCategories = ["a","n","q"]
    let deserializedParams = {};
    params.forEach(function(value, key){
        if (validCategories.includes(key)){
            deserializedParams[key] = JSON.parse(Base64.decode(value));
        }
    });
    //set global threshold variable based on query params or default
    window.threshold = params.get("t") ? params.get("t") : 0.4;
    return deserializedParams;
}
//sets the query params to be equal to whatever value is given
function serialize_params(newparams){
    let params = new URLSearchParams(window.location.search);
    const validCategories = ["a","n","q"] //list of params that should be encoded
    //encodes params, deleting any that are empty
    for (const key in newparams){
        if (validCategories.includes(key)) {
            //if there's any content left in the param, update it. If not, delete it.
            newparams[key].length ? params.set(key, Base64.encodeURI(JSON.stringify(newparams[key]))) : params.delete(key);
        }
    }
    //if there are any params that shouldn't be encoded, deal with them here
    const utilParams = ["t"];
    //sets changes to threshold value---removes if value is at default number of if it's not a number
    if (typeof newparams["t"] === "number"){
        if (newparams["t"] === 0.4){
            params.delete("t");
        } else {
            params.set("t", newparams["t"]);
        }
    } else {
        params.delete("t");
    }
    //deletes any params that aren't approved
    params.forEach(function(value, key){
        if (!validCategories.includes(key) && !utilParams.includes(key)){
            params.delete(key);
        }
    });
    window.location.search = params;
}
//takes all the data and search parameters, and returns the data filtered by those parameters
function execute_query(data, params){
    //gets list of all searchable fields
    const keys = window.store.filter(a => a.searchable).map(a => a.value);
    //build full index
    const options = {
        keys: keys,
        threshold: window.threshold,
        useExtendedSearch: true,
        findAllMatches: true,
    }
    const fuse = new Fuse(data, options);
    //SEARCH 1: All fields search (q) + fuzzy text search (a)
    //adds q and a together and formats them in the way fuse.js expects them
    const a = params.a ? params.a : [];
    const q = params.q ? params.q : [];
    const or = q.length ? { $or: keys.map((k) => ({[k]:q.join(" ")}))} : '';
    const search1 = typeof or === "object"? {$and: [...a, or ]} : {$and: [...a]};
    //search all fields and text fields
      //If there are search results, maps them to be in the same format as the original data
      //If there are no search params, return all data
    let searchRes = search1.$and.length ? fuse.search(search1).map(a => a.item) : data;
    const n = params.n ? params.n : [];
    if (n.length){
        //iterate through each item in the n field
        for (const param in n){
            //get type of param
            const field = Object.keys(n[param])[0];
            const type = get_field_by_value("type", field);
            //deals with numbers
            if (type === "num"){
                //blank Set for storing unique results from among all num searches
                let newSearchResSet = new Set();
                //split number field into array on "," (trim whitespace)
                const nums = String(n[param][field]).split(",").map(a => a.replace(/\s/g,''));
                for (const num in nums){
                    const numrange = nums[num].split("-");
                    //creates Set that contains all unique results from this search
                    searchRes.filter(a => (a[field] >= numrange[0] && a[field] <= numrange[numrange.length - 1])).forEach(a => newSearchResSet.add(a));
                }
                //passes new set of results back into searchRes variable.
                searchRes = [...newSearchResSet];
            //deals with symbols
            } else if (type === "sym"){
                //blank Set for storing unique results form among all sym searches
                let newSearchResSet = new Set();
                ///split symbol field into array on "|" (trim whitespace)
                const syms = String(n[param][field]).split("|").map(a => a.replace(/\s/g,''));
                for (const sym in syms){
                    //if sym contains *, remove * and do a search for anything including the letters
                    if (syms[sym].includes("*")){
                        //removes * from sym and converts it to an array of characters
                        const wildsym = syms[sym].replace("*",'').split('');
                        //filters only search results that contain the array of charaters in wildsym
                        searchRes.filter(a => wildsym.every(val => a[field].split('').includes(val))).forEach(a => newSearchResSet.add(a));
                    } else { //if sym doesn't contain *, do a search for anything exactly matching the letters
                        //note: sorts both strings to ensure that the order doesn't matter
                        searchRes.filter(a => (a[field].split('').sort().join('') === syms[sym].split('').sort().join(''))).forEach(a => newSearchResSet.add(a));
                    }
                }
                //passes new set of results back into searchRes variable.
                searchRes = [...newSearchResSet];
            }
        }
    }
    return searchRes;
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


