import Navigation from "@/components/Navigation";

export default function Rules() {
  return (
    <div className="font-sans min-h-screen w-full max-w-screen">
      <Navigation />
      <main className="container mx-auto px-4 py-8 flex justify-center">
        <div className=" flex flex-col max-w-[1000px] mb-32">
          <h2 className="text-2xl lg:text-4xl font-bold mb-2">
            Rules and Scoring
          </h2>
          <p className='mt-8'>These are the default scoring rules for Failball. All values can be edited within League Settings. If you think we are forgetting something that we should be scoring, <a href='/contact'>let us know!</a></p>
          <p className='mt-4'>
            A couple of things that will look different to long time Fantasy Football players, Kickers and Special teams are drafted as one position.
            That means you draft the entire unit including the kicker, the punter, the punt coverage team and the field goal block unit.
            <br></br>
            <br></br>
            This change makes every special teams play meaningful, from how each punt is placed and fielded, to every time some idiot jumps offisdes on a field goal and extends a drive.
            It also allows for us to score some fun and rare plays like onsides kicks or fake kicks.
          </p>
          
          <div className='hidden w-full gap-2 mt-8 md:flex items-center'>
            <p className='text-sm'>Jump to:</p>
            <a href='#qb' className='text-sm'>Quarterbacks</a>
            <p>-</p>
            <a href='#rb' className='text-sm'>Running Backs</a>
            <p>-</p>
            <a href='#pc' className='text-sm'>Pass Catchers</a>
            <p>-</p>
            <a href='#df' className='text-sm'>Defenses</a>
            <p>-</p>
            <a href='#st' className='text-sm'>Special Teams</a>
          </div>
          <div className='flex w-full gap-2 mt-8 md:hidden items-center'>
            <p className='text-sm'>Jump to:</p>
            <a href='#qb' className='text-sm'>QBs</a>
            <p>-</p>
            <a href='#rb' className='text-sm'>RBs</a>
            <p>-</p>
            <a href='#pc' className='text-sm'>WRs/TEs</a>
            <p>-</p>
            <a href='#df' className='text-sm'>DEF</a>
            <p>-</p>
            <a href='#st' className='text-sm'>ST</a>
          </div>

          <div className="w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 flex flex-col mt-1 max-w-lg">
            <h3 id='qb' className='text-foreground text-lg font-semibold tracking-tight'>
              Quarterbacks
            </h3>
            <p className='flex w-full justify-between'>Incompletion: <span className='text-foreground'>0.5</span></p>
            <p className='flex w-full justify-between'>Interception: <span className='text-foreground'>6</span></p>
            <p className='flex w-full justify-between'>Sack: <span className='text-foreground'>2</span></p>
            <p className='flex w-full justify-between'>Scramble: (QB run for first down): <span className='text-foreground'>-1</span></p>
            
            <p className='flex w-full justify-between mt-2'>Fumble: <span className='text-foreground'>6</span></p>
            <p className='flex w-full justify-between'>Touchdown: <span className='text-foreground'>-2</span></p>

            <h3 id='rb' className='text-foreground text-lg font-semibold tracking-tight mt-8'>
              Running Backs
            </h3>
            <p className='flex w-full justify-between'>Negative Run (Carry for &lt;0 yards): <span className='text-foreground'>2</span></p>
            <p className='flex w-full justify-between'>Neutral Run (Carry for 0-3 yards): <span className='text-foreground'>1</span></p>
            <p className='flex w-full justify-between'>Successful Run (Carry for 3-5 yards): <span className='text-foreground'>0</span></p>
            <p className='flex w-full justify-between'>Explosive Run (Carry for &gt;5 yards): <span className='text-foreground'>-1</span></p>
            
            <p className='flex w-full justify-between mt-2'>Fumble: <span className='text-foreground'>6</span></p>
            <p className='flex w-full justify-between'>Touchdown: <span className='text-foreground'>-2</span></p>

            <h3 id='pc' className='text-foreground text-lg font-semibold tracking-tight mt-8'>
              Pass Catchers (WRs and TEs)
            </h3>
            <p className='flex w-full justify-between'>Incomplete Target (Not drop): <span className='text-foreground'>1</span></p>
            <p className='flex w-full justify-between'>Drop: <span className='text-foreground'>6</span></p>
            <p className='flex w-full justify-between'>Route not targeted: <span className='text-foreground'>0.25</span></p>

            <p className='flex w-full justify-between mt-2'>Negative Catch (Reception for &lt;0 yards): <span className='text-foreground'>2</span></p>
            <p className='flex w-full justify-between'>Neutral Catch (Reception for 0-5 yards): <span className='text-foreground'>1</span></p>
            <p className='flex w-full justify-between'>Successful Catch (Reception for 5-10 yards): <span className='text-foreground'>0</span></p>
            <p className='flex w-full justify-between'>Explosive Catch (Reception for &gt;10 yards): <span className='text-foreground'>-1</span></p>

            <p className='flex w-full justify-between mt-2'>Fumble: <span className='text-foreground'>6</span></p>
            <p className='flex w-full justify-between'>Touchdown: <span className='text-foreground'>-2</span></p>

            <h3 id='df' className='text-foreground text-lg font-semibold tracking-tight mt-8'>
              Defenses
            </h3>
            <p className='flex w-full justify-between'>Touchdown Allowed: <span className='text-foreground'>4</span></p>
            <p className='flex w-full justify-between'>FG Allowed: <span className='text-foreground'>1</span></p>

            <p className='flex w-full justify-between mt-2'>Yards Allowed: (0-100) <span className='text-foreground'>-4</span></p>
            <p className='flex w-full justify-between'>100-200: <span className='text-foreground'>-2</span></p>
            <p className='flex w-full justify-between'>200-300: <span className='text-foreground'>0</span></p>
            <p className='flex w-full justify-between'>300-400: <span className='text-foreground'>2</span></p>
            <p className='flex w-full justify-between'>400-500: <span className='text-foreground'>4</span></p>
            <p className='flex w-full justify-between'>&gt;500: <span className='text-foreground'>6</span></p>

            <p className='flex w-full justify-between mt-2'>Sack: <span className='text-foreground'>-1</span></p>
            <p className='flex w-full justify-between'>Safety: <span className='text-foreground'>-2</span></p>
            <p className='flex w-full justify-between'>Interception: <span className='text-foreground'>-2</span></p>
            <p className='flex w-full justify-between'>Fumble Recovery: <span className='text-foreground'>-2</span></p>
            <p className='flex w-full justify-between'>Pick Six: <span className='text-foreground'>-4</span></p>
            <p className='flex w-full justify-between'>Fumble Returned for TD: <span className='text-foreground'>-4</span></p>

            <h3 id='st' className='text-foreground text-lg font-semibold tracking-tight mt-8'>
              Special Teams
            </h3>
            <p className='flex w-full justify-between'>Missed Extra Point: <span className='text-foreground'>5</span></p>
            <p className='flex w-full justify-between'>Missed Field Goal: <span className='text-foreground'>3</span></p>
            <p className='flex w-full justify-between'>Made Field Goal ( &lt;50 yards): <span className='text-foreground'>-1</span></p>
            <p className='flex w-full justify-between'>Made Field Goal ( &gt;50 yards): <span className='text-foreground'>-2</span></p>

            <p className='flex w-full justify-between mt-2'>Kickoff Returned for TD (Returner): <span className='text-foreground'>-4</span></p>
            <p className='flex w-full justify-between'>Kickoff Return Muffed (Returner): <span className='text-foreground'>4</span></p>
            <p className='flex w-full justify-between'>Kickoff Return Stuffed (Returner downed inside the 20): <span className='text-foreground'>1</span></p>

            <p className='flex w-full justify-between mt-2'>Punt Returned for TD (Returner): <span className='text-foreground'>-4</span></p>
            <p className='flex w-full justify-between'>Punt Return Muffed (Returner): <span className='text-foreground'>4</span></p>
            <p className='flex w-full justify-between'>Punt Return Stuffed (Returner, 0-5 yards): <span className='text-foreground'>1</span></p>
            
            <p className='flex w-full justify-between mt-2'>Punt for Touchback (Punter): <span className='text-foreground'>1</span></p>
            <p className='flex w-full justify-between'>Punt Blocked (Punter): <span className='text-foreground'>4</span></p>

            <p className='flex w-full justify-between mt-2'>Onside Kick Recovery Fail (Return Team): <span className='text-foreground'>6</span></p>
            <p className='flex w-full justify-between'>Penalty to Extend Drive: (FG or Punt Block Unit) <span className='text-foreground'>3</span></p>

          </div>
        </div>
      </main>
    </div>
  );
}