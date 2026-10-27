if (window.angular.bootstrap) {
  // AngularJS is already loaded, so we can return here...
  if (window.console) {
    console.log('WARNING: Tried to load AngularJS more than once.');
  }
  return;
}
