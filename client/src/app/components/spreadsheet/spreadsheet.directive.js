(function() {
    'use strict';

    angular
        .module('oncoscape')
        .directive('osSpreadsheet', spreadsheet);

    /** @ngInject */
    function spreadsheet() {

        var directive = {
            restrict: 'E',
            templateUrl: 'app/components/spreadsheet/spreadsheet.html',
            controller: SpreadsheetController,
            controllerAs: 'vm',
            bindToController: true
        };

        return directive;

        /** @ngInject */
        function SpreadsheetController(osApi, $state, $timeout, $scope, moment, $stateParams, _, $, $q, $window, uiGridConstants, saveAs) {

            var cohortName = '';

            // Loading ...
            osApi.setBusy(true);
            var cohortName = ''

            // View Model
            var vm = this;
            vm.showPanelColumns = false;
            vm.closePanelColumns = function() {
                vm.showPanelColumns = false;
                vm.gridApi.grid.refresh();
            };

            vm.setSize = function() {
                var elGrid = angular.element("#spreadsheet-grid")[0];
                var osLayout = osApi.getLayout();
                var ml = osLayout.left - 1;
                var mr = osLayout.right - 1;
                if (ml === -1) ml = 19;
                if (mr === -1) mr = 19;
                elGrid.style["margin-left"] = ml + "px";
                elGrid.style["margin-right"] = mr + "px";
                elGrid.style.width = ($window.innerWidth - ml - mr - 2) + "px";
                elGrid.style.height = ($window.innerHeight - 140) + "px";
                vm.gridApi.core.handleWindowResize();
            };
            vm.collections = Object.keys(osApi.getDataSource().clinical)
                .map(function(key) {
                    var v = this.data[key];
                    return {
                        name: key,
                        collection: v
                    };
                }, {
                    data: osApi.getDataSource().clinical
                }).filter(function(o) {
                    return (o.name != "events" && o.name != "samplemap");
                });


            vm.collection = vm.collections.reduce(function(p, c) {
                if (c.name == "patient") p = c;
                return p;
            }, vm.collections[0]);
            vm.options = {
                treeRowHeaderAlwaysVisible: false,
                enableSelectionBatchEvent: false,
                enableGridMenu: false,
                enableSelectAll: true,
                onRegisterApi: function(gridApi) {
                    vm.gridApi = gridApi;
                    gridApi.selection.on.rowSelectionChanged($scope, _.debounce(rowSelectionChange, 300));
                }
            };
            vm.exportCsv = function(type) {
            
                var cols = vm.options.columnDefs.filter(function(c) { return c.visible; }).map(function(v) { return v.field; });
                var data = "\"" + cols.join("\",\"") + "\"\n";

                var records = (type == "selected") ? vm.gridApi.grid.api.selection.getSelectedRows() : vm.options.data;

                records
                    .forEach(function(v) {
                        var datum = cols.map(function(v) {
                            return this[v];
                        }, v);
                        data += "\"" + datum.join("\",\"") + "\"\n";
                    });

                var ds = osApi.getDataSource();
                var fileName = ds.source + '-' + ds.name + '-' + cohortName.toLowerCase() + '.csv'.replace(/\s/g, '_');
                var blob = new Blob([data], { type: 'text/csv;charset=windows-1252;' });
                saveAs(blob, fileName);

            };
            vm.showColumns = function() {
                vm.options.columnDefs.forEach(function(v) { v.visible = true; });
                vm.gridApi.grid.refresh();
            };
            vm.hideColumns = function() {
                vm.options.columnDefs.forEach(function(v) { v.visible = false; });
                vm.gridApi.grid.refresh();
            };

            var sortSelectedFn = function(a, b, rowA, rowB) {
                if (!rowA.hasOwnProperty("isSelected")) rowA.isSelected = false;
                if (!rowB.hasOwnProperty("isSelected")) rowB.isSelected = false;
                if (rowA.isSelected === rowB.isSelected) return 0;
                if (rowA.isSelected) return -1;
                return 1;
            };

            vm.sortSelected = function() {
                var col = vm.gridApi.grid.columns[0];
                col.sortingAlgorithm = sortSelectedFn;
                vm.gridApi.grid.sortColumn(col, "asc", false);
                vm.gridApi.core.notifyDataChange(uiGridConstants.dataChange.OPTIONS);
                vm.gridApi.core.notifyDataChange(uiGridConstants.dataChange.COLUMN);
            };

            var selectedIds = [];
            var supressCohortEvent = true;
            var rowSelectionChange = function() {

                selectedIds = vm.gridApi.grid.api.selection.getSelectedRows().map(function(v) { return v.patient_ID; });
                if(supressCohortEvent){
                    supressCohortEvent = false;
                    return;
                } 
                
                if (selectedIds.length == vm.options.data.length || selectedIds.length == 0) {
                    osApi.setCohort([], osApi.ALL, osApi.PATIENT);
                } else {
                    osApi.setCohort(selectedIds, "Spreadsheet", osApi.PATIENT);
                }
            };

            // Initialize
            vm.datasource = osApi.getDataSource();

            // App Event :: Resize
            osApi.onResize.add(vm.setSize);

            // App Event :: Cohort Change
            var onCohortChange = function(cohort) {
                cohortName = cohort.name
                supressCohortEvent = true

                vm.gridApi.grid.api.selection.clearSelectedRows();
                selectedIds = cohort.patientIds;
                var selected = vm.options.data.filter(function(v) {
                    return selectedIds.indexOf(v.patient_ID) != -1;
                });
                selected.forEach(function(i) { vm.gridApi.grid.api.selection.selectRow(i); });
            };
            osApi.onCohortChange.add(onCohortChange);

            // Setup Watches
            $scope.$watch("vm.collection", function() {
                osApi.setBusy(true);
                osApi.query(vm.collection.collection)
                    .then(function(response) {
                        angular.element(".ui-grid-icon-menu").text("Columns");
                        var cols = Object.keys(response.data[0])
                            .map(function(col) {
                                return { field: col, name: col.replace(/_/gi, ' '), width: 250, visible: true };
                            });
                        vm.options.columnDefs = cols;
                        vm.options.data = response.data.map(function(v) {
                            v.color = "#F0DDC0";
                            v.selected = false;
                            return v;
                        });
                        $timeout(function() {
                            onCohortChange(osApi.getCohort());
                        }, 1);
                        vm.setSize();
                        osApi.setBusy(false);
                    });
            });


            // Destroy
            $scope.$on('$destroy', function() {
                osApi.onResize.remove(vm.setSize);
                osApi.onCohortChange.remove(onCohortChange);
            });
        }
    }
})();