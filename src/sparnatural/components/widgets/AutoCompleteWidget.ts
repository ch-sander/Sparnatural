import { DataFactory } from 'rdf-data-factory';
import { BgpPattern, Pattern, Triple, ValuePatternRow, ValuesPattern } from "sparqljs";
import { SelectedVal } from "../SelectedVal";
import SparqlFactory from "../../generators/SparqlFactory";
import { AbstractWidget, RDFTerm, ValueRepetition, WidgetValue } from "./AbstractWidget";
import EndClassGroup from "../builder-section/groupwrapper/criteriagroup/startendclassgroup/EndClassGroup";
import { AutocompleteDataProviderIfc, NoOpAutocompleteProvider } from "./data/DataProviders";
import Awesomplete from 'awesomplete';
import { I18n } from '../../settings/I18n';
import HTMLComponent from '../HtmlComponent';

const factory = new DataFactory();


export class AutoCompleteWidgetValue implements WidgetValue {
  value: {
    label: string;
    rdfTerm: RDFTerm
  };

  key():string {
    return this.value.rdfTerm.value;
  }

  constructor(v:AutoCompleteWidgetValue["value"]) {
    this.value = v;
  }
}

export interface AutocompleteConfiguration {
  dataProvider: AutocompleteDataProviderIfc,
  maxItems: number
}

export class AutoCompleteWidget extends AbstractWidget {
  
  // The default implementation of AutocompleteConfiguration
  static defaultConfiguration: AutocompleteConfiguration = {
    dataProvider: new NoOpAutocompleteProvider(),
    maxItems:15
  }
  
  protected widgetValues: AutoCompleteWidgetValue[];
  protected configuration: AutocompleteConfiguration;

  constructor(
    parentComponent: HTMLComponent,
    configuration: AutocompleteConfiguration,
    startClassValue: SelectedVal,
    objectPropVal: SelectedVal,
    endClassValue: SelectedVal
  ) {
    super(
      "autocomplete-widget",
      parentComponent,
      null,
      startClassValue,
      objectPropVal,
      endClassValue,
      ValueRepetition.MULTIPLE
    );
    this.configuration = configuration;
  }

  render() {
    super.render();

    let inputHtml = $(`<input class="awesomplete"/>`);
    this.html.append(inputHtml);

    let errorHtml =
      $(`<div class="no-items" style="display: none; font-style:italic;">
      ${I18n.labels.ListWidgetNoItem}
    </div>`);

    // $( "#foo" )[ 0 ] is pulling the DOM element from the JQuery object
    // see https://learn.jquery.com/using-jquery-core/faq/how-do-i-pull-a-native-dom-element-from-a-jquery-object/
    const queryInput:HTMLElement = inputHtml[0];

    const awesomplete = new Awesomplete(queryInput, {
      filter: () => { // We will provide a list that is already filtered ...
        return true;
      },
      sort: false,    // ... and sorted.
      minChars: 3,
      maxItems: this.configuration.maxItems,
      list: []
    });


    // the callback called when proposals have been fetched, to populate the suggestion list
    let callback = (items:{term:RDFTerm;label:string;group?:string}[]) => {
      
      let list = new Array<{label:String, value:String}>();
      $.each(items, (key, item) => {
        // Awesomplete list will contain the label as 'label', and the RDFTerm JSON serialization as 'value'
        list.push({
          label: (item.group)?"<span title='"+item.group+"'>"+item.label+"</span>":item.label,
          value: JSON.stringify(item.term)
        });
      });

      // build final list
      awesomplete.list = list;
      awesomplete.evaluate();
    }

    // TODO : this is not working for now
    let errorCallback = (payload:any) => {
      this.html.append(errorHtml);
    }

    // when user selects a value from the autocompletion list...
    queryInput.addEventListener("awesomplete-selectcomplete", (event:Event) => {
      // fetch the autocomplete event payload, which is the JSON serialization of the RDFTerm
      let awesompleteEvent:{label:string, value:string} = (event as unknown as {text:{label:string, value:string}}).text;

      let autocompleteValue= new AutoCompleteWidgetValue({
          label: awesompleteEvent.label,
          // parse back the RDFTerm as an object
          rdfTerm: (JSON.parse(awesompleteEvent.value) as RDFTerm),
      });

      // set the value on the criteria
      inputHtml.val(autocompleteValue.value.label);
      this.renderWidgetVal(autocompleteValue);
    });

    // add the behavior on the input HTML element to fetch the autocompletion value
    queryInput.addEventListener("input", (event:Event) => {
      const phrase = (event.target as HTMLInputElement)?.value;
      // Process inputText as you want, e.g. make an API request.

      if(phrase.length >= 3) {
        this.configuration.dataProvider.getAutocompleteSuggestions(
          this.startClassVal.type,
          this.objectPropVal.type,
          this.endClassVal.type,
          phrase,
          this.settings.language,
          this.settings.defaultLanguage,
          this.settings.typePredicate,
          callback,
          errorCallback
        );
      }
    });

    return this;
  }

  parseInput(input: AutoCompleteWidgetValue["value"]): AutoCompleteWidgetValue {return new AutoCompleteWidgetValue(input)}

  /**
   * @returns  true if the number of values is 1, in which case the widget will handle the generation of the triple itself,
   * not using a VALUES clause; returns false otherwise.
   */
   isBlockingObjectProp() {
    return (
      this.widgetValues.length == 1
      &&
      !((this.ParentComponent.ParentComponent.ParentComponent as EndClassGroup).isVarSelected())
    );
  }

  /**
   * @returns  true if at least one value is selected, in which case we don't need to insert an rdf:type constraint
   * on the end class
   */
   isBlockingEnd(): boolean {
    return (this.widgetValues.length > 0);
   }


  getRdfJsPattern(): Pattern[] {
    if(this.isBlockingObjectProp()) {
      let singleTriple: Triple = SparqlFactory.buildTriple(
        factory.variable(this.startClassVal.variable),
        factory.namedNode(this.objectPropVal.type),
        this.rdfTermToSparqlQuery((this.widgetValues[0] as AutoCompleteWidgetValue).value.rdfTerm)
      );

      let ptrn: BgpPattern = {
        type: "bgp",
        triples: [singleTriple],
      };
  

      return [ptrn];
    } else {
      let vals = (this.widgetValues as AutoCompleteWidgetValue[]).map((v) => {
        let vl: ValuePatternRow = {};
        vl["?"+this.endClassVal.variable] = this.rdfTermToSparqlQuery(v.value.rdfTerm);
        return vl;
      });
      let valuePattern: ValuesPattern = {
        type: "values",
        values: vals,
      };
      return [valuePattern];
    }
  }

}
