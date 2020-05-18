/* eslint-disable no-param-reassign, no-use-before-define */
/* global DataTableHelpers PerfectScrollbar FilePreviewModal animateSpinner HelperModule
initAssignedTasksDropdown I18n */

var MyModuleRepositories = (function() {
  const FULL_VIEW_MODAL = $('#myModuleRepositoryFullViewModal');
  const UPDATE_REPOSITORY_MODAL = $('#updateRepositoryRecordModal');
  const STATUS_POLLING_INTERVAL = 10000;
  var SIMPLE_TABLE;
  var FULL_VIEW_TABLE;
  var FULL_VIEW_TABLE_SCROLLBAR;
  var SELECTED_ROWS = {};

  function reloadRepositoriesList() {
    var repositoriesContainer = $('#assigned-items-container');
    $.get(repositoriesContainer.data('repositories-list-url'), function(result) {
      repositoriesContainer.html(result.html);
      $('.assigned-items-title').attr('data-assigned-items-count', result.assigned_rows_count);
    });
  }

  function tableColumns(tableContainer, skipCheckbox = false) {
    var columns = $(tableContainer).data('default-table-columns');
    var customColumns = $(tableContainer).find('thead th[data-type]');
    for (let i = 0; i < columns.length; i += 1) {
      columns[i].data = String(i);
      columns[i].defaultContent = '';
      if (skipCheckbox && i === 0) columns[i].visible = false;
    }
    customColumns.each((i, column) => {
      columns.push({
        visible: true,
        searchable: true,
        data: String(columns.length),
        defaultContent: $.fn.dataTable.render['default' + column.dataset.type](column.id)
      });
    });
    return columns;
  }

  function fullViewColumnDefs() {
    let columnDefs = [{
      targets: 0,
      visible: true,
      searchable: false,
      orderable: false,
      className: 'dt-body-center',
      sWidth: '1%',
      render: function(data) {
        var checked = data ? 'checked' : '';
        return `<div class="sci-checkbox-container">
                  <input class='repository-row-selector sci-checkbox' type='checkbox' ${checked}>
                  <span class='sci-checkbox-label'></span>
                </div>`;
      }
    }];

    if (FULL_VIEW_MODAL.find('.table').data('type') === 'live') {
      columnDefs.push({
        targets: 1,
        searchable: false,
        className: 'assigned-column',
        sWidth: '1%',
        render: function(data) {
          return $.fn.dataTable.render.AssignedTasksValue(data);
        }
      }, {
        targets: 3,
        render: function(data, type, row) {
          return "<a href='" + row.recordInfoUrl + "' class='record-info-link'>" + data + '</a>';
        }
      });
    }

    columnDefs.push(
      {
        targets: '_all',
        render: function(data) {
          if (typeof data === 'object' && $.fn.dataTable.render[data.value_type]) {
            return $.fn.dataTable.render[data.value_type](data);
          }
          return data;
        }
      }
    );

    return columnDefs;
  }

  function renderSimpleTable(tableContainer) {
    if (SIMPLE_TABLE) SIMPLE_TABLE.destroy();
    SIMPLE_TABLE = $(tableContainer).DataTable({
      dom: "Rt<'pagination-row'<'version-label'><'pagination-actions'p>>",
      processing: true,
      serverSide: true,
      responsive: true,
      pageLength: 5,
      order: [[1, 'asc']],
      sScrollY: '100%',
      sScrollX: '100%',
      sScrollXInner: '100%',
      destroy: true,
      ajax: {
        url: $(tableContainer).data('source'),
        data: function(d) {
          d.assigned = 'assigned';
          d.view_mode = true;
          d.simple_view = true;
        },
        global: false,
        type: 'POST'
      },
      columns: [
        { data: '1' }
      ],
      columnDefs: [{
        targets: 1,
        render: function(data, type, row) {
          return "<a href='" + row.recordInfoUrl + "'"
                 + "class='record-info-link'>" + data + '</a>';
        }
      }],
      drawCallback: function() {
        var repositoryContainer = $(this).closest('.assigned-repository-container');
        repositoryContainer.find('.table.dataTable').removeClass('hidden');
        repositoryContainer.find('.version-label').html(tableContainer.data('version-label'));
        SIMPLE_TABLE.columns.adjust();
      }
    });
  }

  function renderFullViewTable(tableContainer, options = {}) {
    if (FULL_VIEW_TABLE) FULL_VIEW_TABLE.destroy();
    SELECTED_ROWS = {};
    FULL_VIEW_TABLE_SCROLLBAR = false;
    FULL_VIEW_TABLE = $(tableContainer).DataTable({
      dom: "R<'main-actions hidden'<'toolbar'><'filter-container'f>>t<'pagination-row hidden'<'pagination-info'li><'pagination-actions'p>>",
      processing: true,
      stateSave: true,
      serverSide: true,
      order: $(tableContainer).data('default-order'),
      pageLength: 25,
      sScrollX: '100%',
      sScrollXInner: '100%',
      destroy: true,
      ajax: {
        url: $(tableContainer).data('source'),
        data: function(d) {
          if (options.assigned) d.assigned = 'assigned';
          d.view_mode = true;
        },
        global: false,
        type: 'POST'
      },
      columns: tableColumns(tableContainer, options.skipCheckbox),
      columnDefs: fullViewColumnDefs(),

      fnInitComplete: function() {
        var dataTableWrapper = $(tableContainer).closest('.dataTables_wrapper');
        DataTableHelpers.initLengthApearance(dataTableWrapper);
        DataTableHelpers.initSearchField(dataTableWrapper);
        dataTableWrapper.find('.main-actions, .pagination-row').removeClass('hidden');
        if (options.assign_mode) {
          renderFullViewAssignButtons();
        } else {
          $('.table-container .toolbar').html($('#repositoryToolbarButtonsTemplate').html());
          if (FULL_VIEW_MODAL.find('.modal-content').hasClass('show-sidebar')) {
            FULL_VIEW_MODAL.find('#showVersionsSidebar').addClass('active');
          }
        }
        initAssignedTasksDropdown(tableContainer);
      },

      drawCallback: function() {
        FULL_VIEW_TABLE.columns.adjust();
        FilePreviewModal.init();
        renderFullViewRepositoryName(
          tableContainer.attr('data-repository-name'),
          tableContainer.attr('data-repository-snapshot-created')
        );
        updateFullViewRowsCount(tableContainer.attr('data-assigned-items-count'));
        if (FULL_VIEW_TABLE_SCROLLBAR) {
          FULL_VIEW_TABLE_SCROLLBAR.update();
        } else {
          FULL_VIEW_TABLE_SCROLLBAR = new PerfectScrollbar(
            $(tableContainer).closest('.dataTables_scrollBody')[0],
            {
              wheelSpeed: 0.5,
              minScrollbarLength: 20
            }
          );
        }
      },

      stateLoadCallback: function(settings, callback) {
        var loadStateUrl = $(tableContainer).data('load-state-url');
        $.post(loadStateUrl, function(json) {
          if (!options.assign_mode) {
            json.state.columns[0].visible = false;
          }
          callback(json.state);
        });
      },

      rowCallback: function(row) {
        var checkbox = $(row).find('.repository-row-selector');
        if (SELECTED_ROWS[row.id]) {
          $(row).addClass('selected');
          checkbox.attr('checked', !checkbox.attr('checked'));
        }
      }
    });
  }

  function setSelectedItem() {
    let versionsSidebar = FULL_VIEW_MODAL.find('.repository-versions-sidebar');
    let currentId = FULL_VIEW_MODAL.find('.table').data('id');
    versionsSidebar.find('.list-group-item').removeClass('active');
    versionsSidebar.find(`[data-id="${currentId}"]`).addClass('active');

    if (!versionsSidebar.find(`[data-id="${currentId}"]`).data('selected')) {
      $('#setDefaultVersionButton').removeClass('hidden');
    } else {
      $('#setDefaultVersionButton').addClass('hidden');
    }
  }

  function reloadTable(tableUrl) {
    animateSpinner(null, true);
    $.getJSON(tableUrl, (data) => {
      FULL_VIEW_MODAL.find('.table-container').html(data.html);
      renderFullViewTable(FULL_VIEW_MODAL.find('.table'), { assigned: true, skipCheckbox: true });
      setSelectedItem();
      animateSpinner(null, false);
    });
  }

  function initSelectAllCheckbox() {
    FULL_VIEW_MODAL.on('click', 'input.select-all', function() {
      var selectAllCheckbox = $(this);
      var rows = FULL_VIEW_MODAL.find('.dataTables_scrollBody tbody tr');
      $.each(rows, function(i, row) {
        var checkbox = $(row).find('.repository-row-selector');
        if (checkbox.prop('checked') === selectAllCheckbox.prop('checked')) return;

        checkbox.prop('checked', !checkbox.prop('checked'));
        selectFullViewRow(row);
      });
    });
  }

  function refreshSelectAllCheckbox() {
    var checkboxes = FULL_VIEW_MODAL.find('.dataTables_scrollBody .repository-row-selector');
    var selectedCheckboxes = FULL_VIEW_MODAL.find('.dataTables_scrollBody .repository-row-selector:checked');
    var selectAllCheckbox = FULL_VIEW_MODAL.find('input.select-all');
    selectAllCheckbox.prop('indeterminate', false);
    if (selectedCheckboxes.length === 0) {
      selectAllCheckbox.prop('checked', false);
    } else if (selectedCheckboxes.length === checkboxes.length) {
      selectAllCheckbox.prop('checked', true);
    } else {
      selectAllCheckbox.prop('indeterminate', true);
    }
  }

  function checkSnapshotStatus(snapshotItem) {
    $.getJSON(snapshotItem.data('status-url'), (statusData) => {
      if (statusData.status === 'ready') {
        $.getJSON(snapshotItem.data('version-item-url'), (itemData) => {
          snapshotItem.replaceWith(itemData.html);
        });
      } else {
        setTimeout(function() {
          checkSnapshotStatus(snapshotItem);
        }, STATUS_POLLING_INTERVAL);
      }
    });
  }

  function initSimpleTable() {
    $('#assigned-items-container').on('show.bs.collapse', '.assigned-repository-container', function() {
      var repositoryContainer = $(this);
      var repositoryTemplate = $($('#myModuleRepositorySimpleTemplate').html());
      repositoryTemplate.attr('data-source', $(this).data('repository-url'));
      repositoryTemplate.attr('data-version-label', $(this).data('footer-label'));
      repositoryContainer.html(repositoryTemplate);
      renderSimpleTable(repositoryTemplate);
    });
  }

  function initVersionsStatusCheck() {
    let sidebar = FULL_VIEW_MODAL.find('.repository-versions-sidebar');
    sidebar.find('.repository-snapshot-item.provisioning').each(function() {
      var snapshotItem = $(this);
      setTimeout(function() {
        checkSnapshotStatus(snapshotItem);
      }, STATUS_POLLING_INTERVAL);
    });
  }

  function initVersionsSidebarActions() {
    FULL_VIEW_MODAL.on('click', '#showVersionsSidebar', function(e) {
      $(this).toggleClass('active');
      if ($(this).hasClass('active')) {
        $.getJSON(FULL_VIEW_MODAL.find('.table').data('versions-sidebar-url'), (data) => {
          var snapshotsItemsScrollBar;
          FULL_VIEW_MODAL.find('.repository-versions-sidebar').html(data.html);
          snapshotsItemsScrollBar = new PerfectScrollbar(
            FULL_VIEW_MODAL.find('.repository-snapshots-container')[0]
          );
          setSelectedItem();
          FULL_VIEW_MODAL.find('.modal-content').addClass('show-sidebar');
          initVersionsStatusCheck();
          snapshotsItemsScrollBar.update();
          FULL_VIEW_TABLE.columns.adjust();
        });
      } else {
        FULL_VIEW_MODAL.find('#collapseVersionsSidebar').click();
      }
      e.stopPropagation();
    });

    FULL_VIEW_MODAL.on('click', '#createRepositorySnapshotButton', function(e) {
      animateSpinner(null, true);
      $.ajax({
        url: $(this).data('action-path'),
        type: 'POST',
        dataType: 'json',
        success: function(data) {
          let snapshotItem = $(data.html);
          FULL_VIEW_MODAL.find('.snapshots-container-scrollbody').append(snapshotItem);
          setTimeout(function() {
            checkSnapshotStatus(snapshotItem);
          }, STATUS_POLLING_INTERVAL);
          animateSpinner(null, false);
        }
      });
      e.stopPropagation();
    });

    FULL_VIEW_MODAL.on('click', '.delete-snapshot-button', function(e) {
      let snapshotItem = $(this).closest('.repository-snapshot-item');
      animateSpinner(null, true);
      $.ajax({
        url: $(this).data('action-path'),
        type: 'DELETE',
        dataType: 'json',
        success: function() {
          if (snapshotItem.data('id') === FULL_VIEW_MODAL.find('.table').data('id')) {
            reloadTable(FULL_VIEW_MODAL.find('#selectLiveVersionButton').data('table-url'));
          }
          snapshotItem.remove();
          animateSpinner(null, false);
        }
      });
      e.stopPropagation();
    });

    FULL_VIEW_MODAL.on('click', '.select-snapshot-button', function(e) {
      reloadTable($(this).data('table-url'));
      e.stopPropagation();
    });

    FULL_VIEW_MODAL.on('click', '#selectLiveVersionButton', function(e) {
      reloadTable(FULL_VIEW_MODAL.find('#selectLiveVersionButton').data('table-url'));
      e.stopPropagation();
    });

    FULL_VIEW_MODAL.on('click', '#collapseVersionsSidebar', function(e) {
      FULL_VIEW_MODAL.find('.modal-content').removeClass('show-sidebar');
      FULL_VIEW_MODAL.find('#showVersionsSidebar').removeClass('active');
      FULL_VIEW_TABLE.columns.adjust();
      e.stopPropagation();
    });

    FULL_VIEW_MODAL.on('click', '#setDefaultVersionButton', function(e) {
      let data;
      animateSpinner(null, true);

      if (FULL_VIEW_MODAL.find('.table').data('type') === 'live') {
        data = { repository_id: FULL_VIEW_MODAL.find('.table').data('id') };
      } else {
        data = { repository_snapshot_id: FULL_VIEW_MODAL.find('.table').data('id') };
      }

      $.ajax({
        url: $(this).data('select-path'),
        type: 'POST',
        dataType: 'json',
        data: data,
        success: function() {
          let versionsList = FULL_VIEW_MODAL.find('.repository-versions-list');
          versionsList.find('.list-group-item').data('selected', false);
          versionsList.find('.list-group-item.active').data('selected', true);
          $('#setDefaultVersionButton').addClass('hidden');
          animateSpinner(null, false);
        }
      });
      e.stopPropagation();
    });
  }

  function initRepositoryFullView() {
    $('#assigned-items-container').on('click', '.action-buttons .full-screen', function(e) {
      var repositoryNameObject = $(this).closest('.assigned-repository-caret')
        .find('.assigned-repository-title');


      renderFullViewRepositoryName(repositoryNameObject.text());
      FULL_VIEW_MODAL.modal('show');
      $.getJSON($(this).data('table-url'), (data) => {
        FULL_VIEW_MODAL.find('.table-container').html(data.html);
        renderFullViewTable(FULL_VIEW_MODAL.find('.table'), { assigned: true, skipCheckbox: true });
      });
      e.stopPropagation();
    });
  }

  function initRepositoriesDropdown() {
    $('.repositories-assign-container').on('show.bs.dropdown', function() {
      var dropdownContainer = $(this);
      $.getJSON(dropdownContainer.data('repositories-url'), function(result) {
        dropdownContainer.find('.repositories-dropdown-menu').html(result.html);
      });
    });
  }

  function selectFullViewRow(row) {
    var id = row.id;

    if (!SELECTED_ROWS[id]) {
      SELECTED_ROWS[id] = {
        row_name: $(row).find('.record-info-link').text(),
        assigned: $(row).find('.repository-row-selector').prop('checked')
      };
    } else {
      delete SELECTED_ROWS[id];
    }

    $(row).toggleClass('selected');

    if (Object.keys(SELECTED_ROWS).length) {
      $('#assignRepositoryRecords, #updateRepositoryRecords').attr('disabled', false);
    } else {
      $('#assignRepositoryRecords, #updateRepositoryRecords').attr('disabled', true);
    }

    refreshSelectAllCheckbox();
  }

  function renderFullViewAssignButtons() {
    var toolbar = FULL_VIEW_MODAL.find('.dataTables_wrapper .toolbar');
    toolbar.empty();
    if (FULL_VIEW_MODAL.data('rows-count') === 0) {
      toolbar.append($('#my-module-repository-full-view-assign-button').html());
    } else {
      toolbar.append($('#my-module-repository-full-view-update-button').html());
    }
  }

  function updateFullViewRowsCount(value) {
    FULL_VIEW_MODAL.data('rows-count', value);
    FULL_VIEW_MODAL.find('.repository-name').attr('data-rows-count', value);
  }

  function renderFullViewRepositoryName(name, snapshotDate) {
    var title;
    var repositoryName = name || FULL_VIEW_MODAL.find('.repository-name').data('repository-name');

    if (snapshotDate) {
      title = I18n.t('my_modules.repository.full_view.modal_snapshot_header', {
        repository_name: repositoryName,
        snaphot_date: snapshotDate
      });
    } else {
      title = I18n.t('my_modules.repository.full_view.modal_live_header', {
        repository_name: repositoryName
      });
    }
    FULL_VIEW_MODAL.find('.repository-name').data('repository-name', repositoryName);
    FULL_VIEW_MODAL.find('.repository-name').html(title);
  }

  function initRepoistoryAssignView() {
    $('.repositories-dropdown-menu').on('click', '.repository', function(e) {
      var assignUrlModal = $(this).data('assign-url-modal');
      var updateUrlModal = $(this).data('update-url-modal');
      FULL_VIEW_MODAL.modal('show');
      $.get($(this).data('table-url'), (data) => {
        FULL_VIEW_MODAL.find('.table-container').html(data.html);
        FULL_VIEW_MODAL.data('assign-url-modal', assignUrlModal);
        FULL_VIEW_MODAL.data('update-url-modal', updateUrlModal);
        renderFullViewTable(FULL_VIEW_MODAL.find('.table'), { assign_mode: true });
      });
      e.stopPropagation();
    });

    FULL_VIEW_MODAL.on('click', '.table tbody tr', function() {
      var checkbox = $(this).find('.repository-row-selector');
      checkbox.prop('checked', !checkbox.prop('checked'));
      selectFullViewRow(this);
    }).on('click', '.table tbody tr .repository-row-selector', function(e) {
      selectFullViewRow($(this).closest('tr')[0]);
      e.stopPropagation();
    }).on('click', '#assignRepositoryRecords', function() {
      openAssignRecordsModal();
    }).on('click', '#updateRepositoryRecords', function() {
      openUpdateRecordsModal();
    });

    UPDATE_REPOSITORY_MODAL.on('click', '.downstream-action', function() {
      submitUpdateRepositoryRecord({ downstream: true });
    }).on('click', '.task-action', function() {
      submitUpdateRepositoryRecord({ downstream: false });
    });
  }

  function openUpdateRecordsModal() {
    var updateUrl = FULL_VIEW_MODAL.data('update-url-modal');
    $.get(updateUrl, { selected_rows: SELECTED_ROWS }, function(data) {
      var assignList;
      var assignListScrollbar;
      var unassignList;
      var unassignListScrollbar;
      UPDATE_REPOSITORY_MODAL.find('.modal-content').html(data.html);
      UPDATE_REPOSITORY_MODAL.data('update-url', data.update_url);
      assignList = UPDATE_REPOSITORY_MODAL.find('.rows-to-assign .rows-list')[0];
      unassignList = UPDATE_REPOSITORY_MODAL.find('.rows-to-unassign .rows-list')[0];
      if (assignList) assignListScrollbar = new PerfectScrollbar(assignList);
      if (unassignList) unassignListScrollbar = new PerfectScrollbar(unassignList);
      UPDATE_REPOSITORY_MODAL.modal('show');
      if (assignList) assignListScrollbar.update();
      if (unassignList) unassignListScrollbar.update();
    });
  }

  function openAssignRecordsModal() {
    var assignUrl = FULL_VIEW_MODAL.data('assign-url-modal');
    $.get(assignUrl, { selected_rows: SELECTED_ROWS }, function(data) {
      UPDATE_REPOSITORY_MODAL.find('.modal-content').html(data.html);
      UPDATE_REPOSITORY_MODAL.data('update-url', data.update_url);
      UPDATE_REPOSITORY_MODAL.modal('show');
    });
  }

  function submitUpdateRepositoryRecord(options = {}) {
    var rowsToAssign = [];
    var rowsToUnassign = [];
    $.each(Object.keys(SELECTED_ROWS), function(i, rowId) {
      if (SELECTED_ROWS[rowId].assigned) {
        rowsToAssign.push(rowId);
      } else {
        rowsToUnassign.push(rowId);
      }
    });
    $.ajax({
      url: UPDATE_REPOSITORY_MODAL.data('update-url'),
      type: 'PATCH',
      dataType: 'json',
      data: {
        rows_to_assign: rowsToAssign,
        rows_to_unassign: rowsToUnassign,
        downstream: options.downstream
      },
      success: function(data) {
        UPDATE_REPOSITORY_MODAL.modal('hide');
        HelperModule.flashAlertMsg(data.flash, 'success');
        SELECTED_ROWS = {};
        $(FULL_VIEW_TABLE.table().container()).find('.dataTable')
          .attr('data-assigned-items-count', data.rows_count);
        FULL_VIEW_TABLE.ajax.reload(null, false);
        reloadRepositoriesList();
        renderFullViewAssignButtons();
      },
      error: function(data) {
        UPDATE_REPOSITORY_MODAL.modal('hide');
        HelperModule.flashAlertMsg(data.responseJSON.flash, 'danger');
        SELECTED_ROWS = {};
        FULL_VIEW_TABLE.ajax.reload(null, false);
      }
    });
  }

  return {
    init: () => {
      initSimpleTable();
      initRepositoryFullView();
      initRepositoriesDropdown();
      initVersionsSidebarActions();
      initRepoistoryAssignView();
      initSelectAllCheckbox();
    }
  };
}());

MyModuleRepositories.init();
