;; For a polar Binary Tree hedge: every square opens in or sunwise, so this
;; walk always reaches the well, at the seam. Then study the plate.
;; The same spell as north-east.scm, with the hedge's own words.
(until (gate?)
  (if (open? in) (go in)
      (if (open? sunwise) (go sunwise)
          (stop))))
